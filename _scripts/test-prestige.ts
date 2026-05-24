/**
 * Throwaway smoke test for the prestige agent.
 *
 * Run with: npx tsx _scripts/test-prestige.ts
 *
 * Requires env vars (set in .env.local or shell):
 *   GOOGLE_GENERATIVE_AI_API_KEY=...
 *   AI_PROVIDER=gemini
 *   AI_MODEL=gemini-2.5-pro
 *   AI_ALLOW_FALLBACK=false
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * NOTE: makes real grounded Gemini calls. Burns API credits each run.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })
import { assessPrestige } from '../src/lib/reservations/prestige-agent'

const POSITIVE_BRIEF = {
    groupKey: 'test-positive-001',
    primaryReservationId: 'test-positive-001-r',
    eventLocation: 'Carlton Hotel, Cannes, France',
    startDate: '2026-05-15',
    endDate: '2026-05-19',
    adminNotes:
        'Brief from stylist Law Roach for Zendaya. Three statement looks for Cannes Film Festival premiere walks. Final fittings May 13.',
    dispatchNotes: 'Hotel concierge will receive. Insured shipping to Carlton.',
    renter: {
        fullName: 'Law Roach',
        companyName: 'House of Roach',
        email: 'studio@example.com',
    },
    items: [
        { name: 'Oceanspine Petals Statement Necklace', sku: 'OSP-N-001' },
        { name: 'Daffodils Blossom Earrings', sku: 'DAF-E-002' },
    ],
}

const NEGATIVE_BRIEF = {
    groupKey: 'test-negative-001',
    primaryReservationId: 'test-negative-001-r',
    eventLocation: 'Studio 12, East London',
    startDate: '2026-06-02',
    endDate: '2026-06-03',
    adminNotes:
        'Local studio shoot for a brand catalog. No celebrity attached. Just need a pair of earrings for product photography.',
    dispatchNotes: 'Pickup from showroom.',
    renter: {
        fullName: 'Jane Smith',
        companyName: null,
        email: 'jane@example.com',
    },
    items: [{ name: 'Orchid Whisper Studs', sku: 'OW-E-014' }],
}

function summarise(label: string, result: Awaited<ReturnType<typeof assessPrestige>>) {
    console.log(`\n=== ${label} ===`)
    console.log(`tier:           ${result.tier}`)
    console.log(`prestige_score: ${result.prestige_score}`)
    console.log(`confidence:     ${result.confidence}`)
    console.log(`client:         ${result.client_signal.identity || '(none)'} [${result.client_signal.tier_guess}]`)
    console.log(`                rationale: ${result.client_signal.rationale}`)
    console.log(`celebrity:      ${result.celebrity_signal.name || '(none)'} [${result.celebrity_signal.reach_estimate}]`)
    console.log(`                rationale: ${result.celebrity_signal.rationale}`)
    console.log(`event:          ${result.event_signal.name || '(none)'} [${result.event_signal.type}, ${result.event_signal.prestige}]`)
    console.log(`                rationale: ${result.event_signal.rationale}`)
    console.log(`citations (${result.citations.length}):`)
    for (const c of result.citations) {
        console.log(`  - ${c.title} :: ${c.url}`)
    }
    console.log(`schema_version: ${result.schema_version}`)
    console.log(`generated_at:   ${result.generated_at}`)
}

async function main() {
    const label = process.argv[2] || 'both'

    if (label === 'positive' || label === 'both') {
        const t0 = Date.now()
        const result = await assessPrestige(POSITIVE_BRIEF)
        summarise(`POSITIVE (${Date.now() - t0}ms)`, result)

        const looksGood =
            (result.tier === 'iconic' || result.tier === 'red_carpet') &&
            result.prestige_score >= 70 &&
            result.client_signal.identity?.toLowerCase().includes('roach') &&
            result.celebrity_signal.name?.toLowerCase().includes('zendaya') &&
            (result.event_signal.name || '').toLowerCase().includes('cannes')

        console.log(`\nPositive verdict assertion: ${looksGood ? 'PASS' : 'FAIL'}`)
    }

    if (label === 'negative' || label === 'both') {
        const t0 = Date.now()
        const result = await assessPrestige(NEGATIVE_BRIEF)
        summarise(`NEGATIVE (${Date.now() - t0}ms)`, result)

        const looksGood =
            (result.tier === 'standard' || result.tier === 'unknown') &&
            result.prestige_score < 50 &&
            result.confidence !== 'high'

        console.log(`\nNegative verdict assertion: ${looksGood ? 'PASS' : 'FAIL'}`)
    }
}

main().catch(err => {
    console.error('Test failed:', err)
    process.exit(1)
})
