import { inferCharacterFamilyFromText, inferJewelryTypeFromText, inferLineTypeFromText, normalizeLineType } from '@/lib/items/catalog-rules'
import { cleanExtractedText } from '@/lib/lookbook/field-cleaning'
import { loadServerPdfJs } from '@/lib/pdf/loadServerPdfJs'
import type { ItemLineType } from '@/types'

type PdfTextNode = {
    text: string
    x: number
    y: number
    width: number
    height: number
}

export type ParsedPdfCatalogDraft = {
    sku: string
    name: string
    description: string | null
    material: string | null
    color: string | null
    weight: string | null
    size: string | null
    accessories: string | null
    category_form: string | null
    character_family: string
    line_type: ItemLineType
    rrp: number | null
    source_page: number
    section_heading: string
}

export type ParsedPdfCatalogDocument = {
    items: ParsedPdfCatalogDraft[]
    sections: Array<{ key: string; title: string; itemCount: number }>
}

const STYLE_CODE_PATTERN = /\b[A-Z]{2,}(?:-[A-Z0-9]+){2,}\b/
const PRICE_PATTERN = /(?:£|\$|€)\s*\d[\d,.]*/
const WEIGHT_PATTERN = /\b\d+(?:\.\d+)?\s*g\b/i

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim()

const normalizeSectionKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'untitled-section'

const FIELD_PATTERNS = {
    style: /^style:?$/i,
    material: /^material:?$/i,
    color: /^(colour|color):?$/i,
    description: /^description:?$/i,
    size: /^sizes?:?$/i,
    accessories: /^accessories:?$/i,
    weight: /^weight:?$/i,
    rrp: /^rrp:?$/i,
} as const

type BlockField = keyof typeof FIELD_PATTERNS

type BlockRow = {
    label: BlockField | null
    value: string | null
}

const parsePrice = (value?: string | null) => {
    if (!value) return null
    const match = value.match(/(\d+(?:\.\d+)?)/)
    return match ? Number.parseFloat(match[1]) : null
}

const cleanSectionHeading = (value: string) => {
    const normalized = normalizeText(value)
        .replace(/\s+-\s*$/, '')
        .replace(/\s{2,}/g, ' ')

    if (/^(?:[A-Za-z]\s+){3,}[A-Za-z]$/.test(normalized)) {
        return normalized.replace(/\s+/g, '')
    }

    return normalized
}

const detectFieldLabel = (line: string): BlockField | null => {
    const entries = Object.entries(FIELD_PATTERNS) as Array<[BlockField, RegExp]>
    for (const [field, pattern] of entries) {
        if (pattern.test(line)) {
            return field
        }
    }

    return null
}

const appendFieldValue = (currentValue: string | null, nextPart: string) => {
    const normalizedPart = normalizeText(nextPart)
    if (!normalizedPart) {
        return currentValue
    }

    if (!currentValue) {
        return normalizedPart
    }

    if (currentValue.includes(normalizedPart)) {
        return currentValue
    }

    return `${currentValue} ${normalizedPart}`
}

const toBlockRows = (items: PdfTextNode[]): BlockRow[] => {
    const rows: Array<{ y: number; items: PdfTextNode[] }> = []

    for (const item of items) {
        const row = rows.find((entry) => Math.abs(entry.y - item.y) < 1)
        if (row) {
            row.items.push(item)
        } else {
            rows.push({ y: item.y, items: [item] })
        }
    }

    return rows
        .sort((a, b) => b.y - a.y)
        .map((row) => {
            const texts = row.items
                .sort((a, b) => a.x - b.x)
                .map((item) => normalizeText(item.text))
                .filter(Boolean)

            const firstText = texts[0] || ''
            const label = detectFieldLabel(firstText)

            return {
                label,
                value: label ? cleanExtractedText(texts.slice(1).join(' ')) : cleanExtractedText(texts.join(' ')),
            }
        })
        .filter((row) => row.value || row.label)
}

const parseBlockFields = (rows: BlockRow[]) => {
    const fields: Record<BlockField, string | null> = {
        style: null,
        material: null,
        color: null,
        description: null,
        size: null,
        accessories: null,
        weight: null,
        rrp: null,
    }
    const fallbackOrder: BlockField[] = ['style', 'material', 'color', 'description', 'size', 'accessories', 'weight', 'rrp']

    for (const row of rows) {
        const value = row.value
        if (!value) continue

        if (row.label) {
            fields[row.label] = appendFieldValue(fields[row.label], value)
            continue
        }

        if (!fields.style) {
            const styleCode = value.match(STYLE_CODE_PATTERN)?.[0]
            if (styleCode) {
                fields.style = styleCode
                continue
            }
        }
        if (!fields.rrp && PRICE_PATTERN.test(value)) {
            fields.rrp = value
            continue
        }
        if (!fields.weight && WEIGHT_PATTERN.test(value)) {
            fields.weight = value
            continue
        }

        const nextField = fallbackOrder.find((field) => !fields[field])
        if (nextField) {
            fields[nextField] = appendFieldValue(fields[nextField], value)
            continue
        }

        fields.description = appendFieldValue(fields.description, value)
    }

    return fields
}

const toTextNodes = (items: Array<{ str?: string; width?: number; height?: number; transform?: number[] }>): PdfTextNode[] => {
    return items
        .map(item => ({
            text: normalizeText(item.str || ''),
            x: item.transform?.[4] || 0,
            y: item.transform?.[5] || 0,
            width: item.width || 0,
            height: item.height || 0,
        }))
        .filter(item => item.text)
}

const extractPageHeading = (items: PdfTextNode[], pageWidth: number): string | null => {
    const candidates = items
        .filter(item =>
            item.x < pageWidth * 0.55 &&
            item.height >= 10 &&
            !item.text.startsWith('[') &&
            !STYLE_CODE_PATTERN.test(item.text)
        )
        .sort((a, b) => (b.height - a.height) || (b.y - a.y))

    return candidates[0]?.text || null
}

const clusterColumns = (anchors: PdfTextNode[]): number[] => {
    const columns: number[] = []

    for (const anchor of anchors.sort((a, b) => a.x - b.x)) {
        const existing = columns.find(column => Math.abs(column - anchor.x) < 28)
        if (existing === undefined) {
            columns.push(anchor.x)
        }
    }

    return columns.sort((a, b) => a - b)
}

const assignColumn = (x: number, columns: number[]) => {
    const best = columns.reduce<{ distance: number; column: number | null }>((result, column) => {
        const distance = Math.abs(column - x)
        if (distance < result.distance) {
            return { distance, column }
        }
        return result
    }, { distance: Number.POSITIVE_INFINITY, column: null })

    return best.column
}

const parseBlock = (
    rows: BlockRow[],
    sectionHeading: string,
    pageNumber: number,
    defaultLineType: ItemLineType
): ParsedPdfCatalogDraft | null => {
    if (rows.length < 2) {
        return null
    }

    const fields = parseBlockFields(rows)
    const sku = normalizeText(fields.style || '')
    if (!STYLE_CODE_PATTERN.test(sku)) {
        return null
    }

    const cleanedSectionHeading = cleanSectionHeading(sectionHeading)
    const material = fields.material
    const color = fields.color
    const description = fields.description
    const name = description || cleanedSectionHeading
    const size = fields.size
    const accessories = fields.accessories
    const weight = fields.weight
    const priceText = fields.rrp
    const characterSource = [cleanedSectionHeading, name].filter(Boolean).join(' ')
    const lineTypeSource = [cleanedSectionHeading, name, sku].join(' ')

    return {
        sku,
        name: normalizeText(name),
        description: description ? normalizeText(description) : normalizeText(name),
        material: material ? normalizeText(material) : null,
        color: color ? normalizeText(color) : null,
        weight: weight ? normalizeText(weight) : null,
        size: size ? normalizeText(size) : null,
        accessories: accessories ? normalizeText(accessories) : null,
        category_form: inferJewelryTypeFromText(`${cleanedSectionHeading} ${name}`),
        character_family: inferCharacterFamilyFromText(characterSource),
        line_type: normalizeLineType(inferLineTypeFromText(lineTypeSource, defaultLineType), defaultLineType),
        rrp: parsePrice(priceText),
        source_page: pageNumber,
        section_heading: cleanedSectionHeading,
    }
}

export async function parsePdfCatalog(
    pdfBytes: Uint8Array,
    defaultLineType: ItemLineType
): Promise<ParsedPdfCatalogDocument> {
    const pdfjs = await loadServerPdfJs()
    const document = await pdfjs.getDocument({ data: pdfBytes }).promise
    const parsedItems: ParsedPdfCatalogDraft[] = []

    for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
        const page = await document.getPage(pageIndex)
        const content = await page.getTextContent()
        const viewport = page.getViewport({ scale: 1 })
        const items = toTextNodes(content.items as Array<{ str?: string; width?: number; height?: number; transform?: number[] }>)
        const anchors = items.filter(item => STYLE_CODE_PATTERN.test(item.text))

        if (!anchors.length) {
            page.cleanup()
            continue
        }

        const columns = clusterColumns(anchors)
        const pageHeading = extractPageHeading(items, viewport.width) || 'Imported PDF Section'
        const anchorsByColumn = new Map<number, PdfTextNode[]>()

        for (const anchor of anchors) {
            const column = assignColumn(anchor.x, columns)
            if (column === null) continue
            const columnAnchors = anchorsByColumn.get(column) || []
            columnAnchors.push(anchor)
            anchorsByColumn.set(column, columnAnchors)
        }

        for (const [column, columnAnchors] of anchorsByColumn.entries()) {
            const sortedAnchors = [...columnAnchors].sort((a, b) => b.y - a.y)

            for (let index = 0; index < sortedAnchors.length; index += 1) {
                const anchor = sortedAnchors[index]
                const lowerBound = sortedAnchors[index + 1]?.y ?? Number.NEGATIVE_INFINITY
                const blockItems = items
                    .filter(item =>
                        Math.abs(item.x - column) < 26 &&
                        item.y <= anchor.y &&
                        item.y > lowerBound
                    )
                    .sort((a, b) => (b.y - a.y) || (a.x - b.x))

                const blockRows = toBlockRows(blockItems)
                const parsed = parseBlock(blockRows, pageHeading, pageIndex, defaultLineType)
                if (parsed) {
                    parsedItems.push(parsed)
                }
            }
        }

        page.cleanup()
    }

    const deduped = Array.from(
        parsedItems.reduce((map, item) => {
            map.set(item.sku, item)
            return map
        }, new Map<string, ParsedPdfCatalogDraft>())
            .values()
    )

    const sections = Array.from(
        deduped.reduce((map, item) => {
            const key = normalizeSectionKey(item.section_heading)
            const existing = map.get(key)
            if (existing) {
                existing.itemCount += 1
            } else {
                map.set(key, { key, title: item.section_heading, itemCount: 1 })
            }
            return map
        }, new Map<string, { key: string; title: string; itemCount: number }>())
            .values()
    )

    return {
        items: deduped,
        sections,
    }
}
