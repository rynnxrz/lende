import { z } from 'zod'
import type { DocumentStructureSection, LookbookItemDraft, ParsedPage } from '@/types'
import { createLlmClient } from '@/lib/ai/llm-client'
import { normalizeLineType, sanitizeCharacterFamily } from '@/lib/items/catalog-rules'
import { cleanExtractedSku, cleanExtractedText } from '@/lib/lookbook/field-cleaning'
import { coerceNumber } from '@/lib/lookbook/utils'

const extractedItemSchema = z.object({
    page_numbers: z.array(z.number().int().positive()).min(1),
    name: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    sku: z.string().nullable().default(null),
    material: z.string().nullable().default(null),
    color: z.string().nullable().default(null),
    weight: z.string().nullable().default(null),
    rental_price: z.union([z.number(), z.string()]).nullable().default(null),
    replacement_cost: z.union([z.number(), z.string()]).nullable().default(null),
    category_name: z.string().nullable().default(null),
    line_type: z.string().nullable().default(null),
    character_family: z.string().nullable().default(null),
    image_candidates: z.array(z.object({
        page_number: z.number().int().positive(),
        image_index: z.number().int().nonnegative(),
    })).default([]),
    confidence: z.number().min(0).max(1).default(0.5),
    reasoning_summary: z.string().min(1),
})

const schema = z.object({
    items: z.array(extractedItemSchema).default([]),
})

const buildPrompt = (input: {
    section: DocumentStructureSection
    pages: ParsedPage[]
}) => {
    const compactPages = input.pages.map(page => ({
        page_number: page.page_number,
        raw_text_blocks: page.raw_text_blocks.slice(0, 140).map(block => ({
            text: block.text,
            bbox: block.bbox,
            font_size: block.font_size,
        })),
        image_anchors: page.image_anchors,
    }))

    return `You are ProductDataSkill for a jewelry lookbook import workflow.

You are given ONE series only.
Extract sellable jewelry items from these pages.

Return JSON only.

Rules:
- Do not duplicate the same item across pages.
- Use null for missing fields.
- page_numbers must reference the pages used as evidence.
- image_candidates should reference likely product images by page_number and image_index only.
- Keep reasoning_summary short and factual.

Series section:
${JSON.stringify(input.section, null, 2)}

Parsed pages:
${JSON.stringify(compactPages, null, 2)}`
}

export async function runProductDataSkill(input: {
    section: DocumentStructureSection
    pages: ParsedPage[]
    defaultLineType?: LookbookItemDraft['line_type']
    model?: string | null
    decisionId?: string | null
    sessionId?: string | null
}): Promise<LookbookItemDraft[]> {
    const llmClient = createLlmClient()
    const result = await llmClient.generateStructured({
        model: input.model,
        schema,
        prompt: buildPrompt(input),
        systemInstruction: 'Extract item-level fields for one series only. Output JSON only.',
        context: {
            feature: 'lookbook_import',
            operation: 'product_extract',
            decision_id: input.decisionId,
            entity_type: 'lookbook_session',
            entity_id: input.sessionId || null,
            route_kind: 'llm',
            prompt_key: 'lookbook_product_extract',
            prompt_version: 'v1',
            metadata: {
                section_id: input.section.id,
                section_name: input.section.detected_name,
                page_count: input.pages.length,
            },
        },
    })

    return result.items.map((item) => {
        const imageCandidates = item.image_candidates
            .map(candidate => {
                const matchingPage = input.pages.find(page => page.page_number === candidate.page_number)
                const matchingAnchor = matchingPage?.image_anchors.find(anchor => anchor.image_index === candidate.image_index)
                if (!matchingPage || !matchingAnchor) {
                    return null
                }

                return {
                    page_number: candidate.page_number,
                    image_index: candidate.image_index,
                    bbox: matchingAnchor.bbox,
                }
            })
            .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))

        return {
            section_id: input.section.id,
            page_numbers: item.page_numbers,
            name: cleanExtractedText(item.name),
            description: cleanExtractedText(item.description),
            sku: cleanExtractedSku(item.sku),
            material: cleanExtractedText(item.material),
            color: cleanExtractedText(item.color),
            weight: cleanExtractedText(item.weight),
            rental_price: coerceNumber(item.rental_price),
            replacement_cost: coerceNumber(item.replacement_cost),
            category_name: item.category_name?.trim() || null,
            category_id: null,
            collection_name: input.section.collection_name || input.section.detected_name,
            collection_id: input.section.collection_id || null,
            line_type: normalizeLineType(item.line_type, input.defaultLineType || 'Mainline'),
            character_family: sanitizeCharacterFamily(item.character_family),
            image_candidates: imageCandidates,
            issues: [],
            confidence: item.confidence,
            review_hints: [],
            reasoning_summary: item.reasoning_summary.trim() || `Extracted from ${input.section.detected_name}.`,
        }
    }).filter(item => item.name || item.sku)
}
