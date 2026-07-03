const FIELD_LABEL_AT_END = /\s+\b(?:style|description|colou?r|material|sizes?|accessories|weight|rrp)\s*:?\s*$/i
const SKU_PATTERN = /\b[A-Z]{2,}(?:-[A-Z0-9]+){2,}\b/

export const cleanExtractedText = (value?: string | null) => {
    const cleaned = value?.replace(/\s+/g, ' ').replace(FIELD_LABEL_AT_END, '').trim()
    return cleaned || null
}

export const cleanExtractedSku = (value?: string | null) => {
    const match = value?.match(SKU_PATTERN)
    return match?.[0] || cleanExtractedText(value)
}
