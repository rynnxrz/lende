import { z } from 'zod'
import { createAiGateway } from '@/lib/ai/gateway'
import { createAiDecision, completeAiDecision } from '@/lib/ai/decision-trace'
import { resolveAiRouteConfig } from '@/lib/ai/settings'

const MODEL = 'gemini-2.5-pro'
const SCHEMA_VERSION = 'v1'

// Single-tenant prototype — IvyJSTUDIO only (see Loophole #5 in plan).
// Multi-tenant rollout would replace this with a runtime lookup from the brief's reservation.organization_id.
const IVYJSTUDIO_ORG_ID = 'a4044404-bf70-497c-9c5d-946a0440c8ad'

export const PrestigeAssessmentSchema = z.object({
    prestige_score: z.number().int().min(0).max(100),
    tier: z.enum(['iconic', 'red_carpet', 'editorial', 'standard', 'unknown']),
    client_signal: z.object({
        identity: z.string().nullable(),
        tier_guess: z.enum(['A_list', 'established', 'emerging', 'unknown']),
        rationale: z.string(),
    }),
    celebrity_signal: z.object({
        name: z.string().nullable(),
        reach_estimate: z.enum(['global', 'regional', 'niche', 'unknown']),
        rationale: z.string(),
    }),
    event_signal: z.object({
        name: z.string().nullable(),
        type: z.enum(['red_carpet', 'press', 'editorial', 'private', 'studio', 'unknown']),
        prestige: z.enum(['iconic', 'high', 'medium', 'low', 'unknown']),
        rationale: z.string(),
    }),
    citations: z.array(z.object({ title: z.string(), url: z.string() })).max(8),
    confidence: z.enum(['high', 'medium', 'low']),
})

export type PrestigeAssessment = z.infer<typeof PrestigeAssessmentSchema>

export type PrestigeAgentInput = {
    groupKey: string
    primaryReservationId: string
    eventLocation: string | null
    startDate: string
    endDate: string
    adminNotes: string | null
    dispatchNotes: string | null
    renter: { fullName: string | null; companyName: string | null; email: string | null }
    items: Array<{ name: string | null; sku: string | null }>
}

export type PersistedPrestige = PrestigeAssessment & {
    schema_version: string
    generated_at: string
}

const UNKNOWN_FALLBACK: PrestigeAssessment = {
    prestige_score: 0,
    tier: 'unknown',
    client_signal: {
        identity: null,
        tier_guess: 'unknown',
        rationale: 'Agent failed before producing a verdict.',
    },
    celebrity_signal: {
        name: null,
        reach_estimate: 'unknown',
        rationale: 'Agent failed before producing a verdict.',
    },
    event_signal: {
        name: null,
        type: 'unknown',
        prestige: 'unknown',
        rationale: 'Agent failed before producing a verdict.',
    },
    citations: [],
    confidence: 'low',
}

const RESEARCH_SYSTEM_PROMPT = `You are a research assistant for a luxury jewelry brand. Your job is to read a single rental brief and conduct online research about the people and event involved, so a downstream synthesiser can score its red-carpet prestige.

Hard rules:
1. Build search queries using only public-facing entity names: the stylist's name, the celebrity's name, the event name or venue. Never include customer emails, phone numbers, internal reservation IDs, or any personally identifying detail you see in the brief.
2. Use the Google Search tool to verify identities and reach. If a name in the brief looks like an established stylist, agent, celebrity, or event, search for it.
3. Cite the URLs you actually visited. Do not invent sources.

For each of the three signals (client / celebrity / event), report what you found, with the URLs you used. If you cannot identify a signal from public sources, say so explicitly.`

const SYNTHESIS_SYSTEM_PROMPT = `You score styling-rental briefs for red-carpet prestige based on three signals:
- client identity (the stylist or agency requesting)
- associated celebrity reach (the person who will wear the piece)
- event profile (the occasion the piece is for)

Score 0-100 with tier mapping:
- 90-100 iconic — Met Gala / Oscars / Cannes red carpet with A-list wearer
- 70-89  red_carpet — major awards or festival red carpet, OR A-list wearer at lesser event
- 50-69  editorial — Vogue/Harper's tier cover or top-tier campaign
- 20-49  standard — press day, brand launch, studio shoot
- 0-19   unknown — no signals identified

Caps:
- Celebrity unknown but stylist is A-list (Law Roach, Karla Welch, Wayman + Micah, Jason Bolden, etc.) → max 75
- Event unknown but celebrity is A-list → max 70
- All three signals unknown → tier='unknown' and confidence='low' regardless of score

Rules:
- Only cite URLs that appeared in the research transcript provided to you. Do not fabricate.
- If you are unsure, prefer lower confidence and lower tier.
- Respond with ONLY the structured JSON object matching the schema.`

const EMAIL_PATTERN = /\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g
const PHONE_PATTERN = /\+?\d[\d\s.-]{7,}\d/g

function sanitisePii(text: string | null | undefined): string {
    if (!text) return ''
    return text
        .replace(EMAIL_PATTERN, '[email redacted]')
        .replace(PHONE_PATTERN, '[phone redacted]')
        .trim()
}

function buildResearchPrompt(input: PrestigeAgentInput): string {
    const items = input.items
        .map(i => `- ${i.name || 'unnamed item'}${i.sku ? ` (${i.sku})` : ''}`)
        .join('\n') || '- (no items linked)'

    const renterLabel = input.renter.companyName || input.renter.fullName || '(unspecified)'

    return [
        'Here is a single rental brief. Conduct online research and report what you find.',
        '',
        `Event location / venue: ${input.eventLocation || '(not specified)'}`,
        `Use window: ${input.startDate} to ${input.endDate}`,
        `Requested by: ${renterLabel}`,
        '',
        'Items requested:',
        items,
        '',
        'Notes from the stylist/operator (PII removed):',
        sanitisePii(input.adminNotes) || '(no notes)',
        '',
        'Dispatch notes (PII removed):',
        sanitisePii(input.dispatchNotes) || '(no notes)',
        '',
        'Identify the stylist/agency, the celebrity (if any) who will wear the piece, and the event. For each, search the web to verify and gather context. Report findings with URLs.',
    ].join('\n')
}

function buildSynthesisPrompt(input: PrestigeAgentInput, researchText: string): string {
    return [
        'Brief summary:',
        `- Event location: ${input.eventLocation || '(not specified)'}`,
        `- Window: ${input.startDate} to ${input.endDate}`,
        `- Items: ${input.items.map(i => i.name || 'unnamed').join(', ') || '(none)'}`,
        '',
        'Research findings:',
        researchText,
        '',
        'Now produce the structured prestige assessment.',
    ].join('\n')
}

let groundingAssertionCache: { ok: boolean; reason: string } | null = null

export async function assertGroundingProviderAvailable(): Promise<void> {
    if (groundingAssertionCache?.ok) return
    if (groundingAssertionCache && !groundingAssertionCache.ok) {
        throw new Error(groundingAssertionCache.reason)
    }

    const envProvider = process.env.AI_PROVIDER || 'gemini'
    if (envProvider !== 'gemini') {
        const reason = `Prestige ranking requires AI_PROVIDER=gemini (currently ${envProvider}).`
        groundingAssertionCache = { ok: false, reason }
        throw new Error(reason)
    }
    if (process.env.AI_ALLOW_FALLBACK === 'true') {
        const reason = 'Prestige ranking requires AI_ALLOW_FALLBACK=false to prevent silent fallback to a non-grounding provider.'
        groundingAssertionCache = { ok: false, reason }
        throw new Error(reason)
    }

    try {
        const route = await resolveAiRouteConfig()
        if (route.provider !== 'gemini') {
            const reason = `Resolved AI provider is ${route.provider}, expected gemini for grounding.`
            groundingAssertionCache = { ok: false, reason }
            throw new Error(reason)
        }
        if (route.allow_fallback) {
            const reason = 'Resolved AI route allows fallback; disable for grounded prestige ranking.'
            groundingAssertionCache = { ok: false, reason }
            throw new Error(reason)
        }
    } catch (err) {
        if (groundingAssertionCache) throw err
        throw err
    }

    groundingAssertionCache = { ok: true, reason: '' }
}

function isValidUrl(url: string): boolean {
    if (!/^https?:\/\//i.test(url)) return false
    try {
        new URL(url)
        return true
    } catch {
        return false
    }
}

export async function assessPrestige(input: PrestigeAgentInput): Promise<PersistedPrestige> {
    await assertGroundingProviderAvailable()

    const gateway = createAiGateway()
    const decisionId = await createAiDecision({
        feature: 'prestige_ranking',
        operation: 'assess',
        organizationId: IVYJSTUDIO_ORG_ID,
        entityType: 'reservation_group',
        entityId: input.groupKey,
        provider: 'gemini',
        model: MODEL,
        metadata: { schema_version: SCHEMA_VERSION, primary_reservation_id: input.primaryReservationId },
    })

    const generatedAt = new Date().toISOString()

    try {
        const research = await gateway.generateText({
            model: MODEL,
            tools: ['googleSearch'],
            temperature: 0.3,
            maxOutputTokens: 4096,
            systemInstruction: RESEARCH_SYSTEM_PROMPT,
            contents: buildResearchPrompt(input),
            runContext: {
                feature: 'prestige_ranking',
                operation: 'research',
                decision_id: decisionId,
                route_kind: 'llm',
                entity_type: 'reservation_group',
                entity_id: input.groupKey,
                prompt_key: 'prestige_research',
                prompt_version: SCHEMA_VERSION,
            },
        })

        const verdict = await gateway.generateStructured({
            model: MODEL,
            schema: PrestigeAssessmentSchema,
            temperature: 0,
            maxOutputTokens: 2048,
            systemInstruction: SYNTHESIS_SYSTEM_PROMPT,
            contents: buildSynthesisPrompt(input, research.text || '(no research text returned)'),
            runContext: {
                feature: 'prestige_ranking',
                operation: 'assess',
                decision_id: decisionId,
                route_kind: 'llm',
                entity_type: 'reservation_group',
                entity_id: input.groupKey,
                prompt_key: 'prestige_synthesis',
                prompt_version: SCHEMA_VERSION,
            },
        })

        const cleaned: PrestigeAssessment = {
            ...verdict,
            citations: verdict.citations.filter(c => isValidUrl(c.url)),
        }

        await completeAiDecision({
            decisionId,
            status: 'completed',
            provider: 'gemini',
            model: MODEL,
            metadata: {
                tier: cleaned.tier,
                prestige_score: cleaned.prestige_score,
                confidence: cleaned.confidence,
                citation_count: cleaned.citations.length,
            },
        })

        return { ...cleaned, schema_version: SCHEMA_VERSION, generated_at: generatedAt }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown prestige agent failure'
        await completeAiDecision({
            decisionId,
            status: 'failed',
            provider: 'gemini',
            model: MODEL,
            errorMessage: message,
        })
        return { ...UNKNOWN_FALLBACK, schema_version: SCHEMA_VERSION, generated_at: generatedAt }
    }
}
