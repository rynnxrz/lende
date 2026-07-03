import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanExtractedSku, cleanExtractedText } from '../field-cleaning.ts'

test('cleanExtractedSku strips trailing field labels from SKU values', () => {
    assert.equal(cleanExtractedSku('RB-OP-BK001 Style:'), 'RB-OP-BK001')
})

test('cleanExtractedText strips trailing field labels from title values', () => {
    assert.equal(cleanExtractedText('Oceanspine Petals Earrings Description:'), 'Oceanspine Petals Earrings')
    assert.equal(cleanExtractedText('Silver Colour:'), 'Silver')
})
