import type {
    CustomerServiceFactRow,
    CustomerServiceHandoff,
    CustomerServiceIdentityHints,
    CustomerServiceInteractionKind,
    CustomerServicePageContext,
    CustomerServicePresentation,
    CustomerServiceReplyMode,
    CustomerServiceToolResult,
    RentalIntentDraft,
} from '@/lib/customer-service/schemas'
import { BRAND_NAME, BRAND_CONCIERGE_NAME } from '@/lib/constants/brand'

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount)

const VALID_SOURCE_PREFIXES = ['tool:', 'page:']

export const brandInstruction = [
    `You are ${BRAND_CONCIERGE_NAME}, the customer-facing concierge for ${BRAND_NAME}.`,
    'Address the customer with 您 in Chinese.',
    'Use short sentences.',
    'Do not use markdown bullet lists.',
    'Avoid words like ticket, issue, error, failed, tool, schema, or system.',
    'Prefer phrases like 我来为您确认 and 我来为您安排专属顾问.',
    'Only rely on supplied page context, verified tool outputs, or the prepared intake draft.',
].join(' ')

function isValidFactSource(source: string) {
    return VALID_SOURCE_PREFIXES.some(prefix => source.startsWith(prefix))
}

function buildGreetingPresentation(language: 'zh' | 'en'): CustomerServicePresentation {
    return {
        body: language === 'zh'
            ? '您好，我可以帮您查询订单、发票、作品规格、指定作品档期，或先整理一份租赁意向。'
            : 'Hello, I can help with order updates, invoice details, verified product specs, a specific piece\'s availability, or a rental brief.',
        factRows: [],
        links: [],
        intakePrompt: null,
    }
}

function buildProductFactsPresentation(toolResults: CustomerServiceToolResult[], language: 'zh' | 'en'): CustomerServicePresentation {
    const catalogFacts = toolResults.find(result => result.toolName === 'getCatalogFacts')
    const firstItem = Array.isArray(catalogFacts?.data.items)
        ? catalogFacts.data.items[0] as Record<string, unknown> | undefined
        : undefined

    if (!firstItem) {
        return {
            body: language === 'zh'
                ? '我暂时没有读到这件作品的已验证规格。若您需要，我来继续为您确认。'
                : 'I do not have the verified specs for this piece just yet. If you wish, I can confirm them for you.',
            factRows: [],
            links: [],
            intakePrompt: null,
        }
    }

    const factRows: CustomerServiceFactRow[] = []
    const addRow = (label: string, value: unknown, source = 'tool:getCatalogFacts') => {
        if (value === null || value === undefined || value === '') return
        factRows.push({ label, value: String(value), source })
    }

    addRow(language === 'zh' ? '作品' : 'Piece', firstItem.name)
    addRow('SKU', firstItem.sku)
    addRow(language === 'zh' ? '材质' : 'Material', firstItem.material)
    addRow(language === 'zh' ? '重量' : 'Weight', firstItem.weight)

    if (typeof firstItem.rentalPrice === 'number') {
        addRow(language === 'zh' ? '租金' : 'Rental', formatCurrency(firstItem.rentalPrice))
    }
    if (typeof firstItem.replacementCost === 'number') {
        addRow(language === 'zh' ? '参考价值' : 'Reference value', formatCurrency(firstItem.replacementCost))
    }

    const specs = firstItem.specs && typeof firstItem.specs === 'object' && !Array.isArray(firstItem.specs)
        ? Object.entries(firstItem.specs as Record<string, unknown>)
        : []

    for (const [key, value] of specs) {
        addRow(key, value)
    }

    const limitedRows = factRows.slice(0, 8)

    return {
        body: limitedRows.length > 0
            ? (language === 'zh'
                ? '这是目前已验证的作品信息。若您想确认更细的珠宝规格，我来继续为您确认。'
                : 'These are the verified details I have for this piece. If you need finer jewelry specs, I can confirm them for you.')
            : (language === 'zh'
                ? '我暂时没有读到这件作品的已验证规格。若您需要，我来继续为您确认。'
                : 'I do not have the verified specs for this piece just yet. If you wish, I can confirm them for you.'),
        factRows: limitedRows,
        links: [],
        intakePrompt: null,
    }
}

function buildOrderPresentation(toolResults: CustomerServiceToolResult[], language: 'zh' | 'en'): CustomerServicePresentation {
    const requestStatus = toolResults.find(result => result.toolName === 'getRequestStatusByEmailAndFingerprint')
    const latest = Array.isArray(requestStatus?.data.requests)
        ? requestStatus.data.requests[0] as Record<string, unknown> | undefined
        : undefined

    if (!latest) {
        return {
            body: language === 'zh'
                ? '我暂时没有找到与这次查询匹配的请求记录。您可以核对一下邮箱或参考号，我再继续为您确认。'
                : 'I could not find a request that matches this lookup just yet. You may wish to check the email or reference and I can confirm it for you.',
            factRows: [],
            links: [],
            intakePrompt: null,
        }
    }

    const itemNames = Array.isArray(latest.itemNames)
        ? latest.itemNames.map(String).join(', ')
        : null

    return {
        body: language === 'zh'
            ? '这是目前已确认的订单进度。'
            : 'These are the confirmed details for the request right now.',
        factRows: [
            ...(itemNames ? [{ label: language === 'zh' ? '作品' : 'Pieces', value: itemNames, source: 'tool:getRequestStatusByEmailAndFingerprint' as const }] : []),
            ...(typeof latest.status === 'string' && latest.status
                ? [{ label: language === 'zh' ? '状态' : 'Status', value: latest.status, source: 'tool:getRequestStatusByEmailAndFingerprint' as const }]
                : []),
            ...(typeof latest.startDate === 'string' && latest.startDate
                ? [{ label: language === 'zh' ? '开始日期' : 'Start', value: latest.startDate, source: 'tool:getRequestStatusByEmailAndFingerprint' as const }]
                : []),
            ...(typeof latest.endDate === 'string' && latest.endDate
                ? [{ label: language === 'zh' ? '结束日期' : 'End', value: latest.endDate, source: 'tool:getRequestStatusByEmailAndFingerprint' as const }]
                : []),
            ...(typeof latest.location === 'string' && latest.location
                ? [{ label: language === 'zh' ? '地点' : 'Location', value: latest.location, source: 'tool:getRequestStatusByEmailAndFingerprint' as const }]
                : []),
            ...(typeof latest.invoiceStatus === 'string' && latest.invoiceStatus
                ? [{ label: language === 'zh' ? '发票状态' : 'Invoice', value: latest.invoiceStatus, source: 'tool:getRequestStatusByEmailAndFingerprint' as const }]
                : []),
        ].slice(0, 8),
        links: typeof latest.paymentPath === 'string' && latest.paymentPath
            ? [{
                label: language === 'zh' ? '查看付款页面' : 'Open payment page',
                href: latest.paymentPath,
                kind: 'open_link',
            }]
            : [],
        intakePrompt: null,
    }
}

function buildInvoicePresentation(toolResults: CustomerServiceToolResult[], language: 'zh' | 'en'): CustomerServicePresentation {
    const invoiceContext = toolResults.find(result => result.toolName === 'getInvoiceContextByInvoiceId')
    const pdfLink = toolResults.find(result => result.toolName === 'getPublicPdfLink')
    const links: CustomerServicePresentation['links'] = []

    const pdfPath = typeof invoiceContext?.data.pdfPath === 'string' && invoiceContext.data.pdfPath
        ? invoiceContext.data.pdfPath
        : typeof pdfLink?.data.pdfPath === 'string' && pdfLink.data.pdfPath
            ? pdfLink.data.pdfPath
            : null

    if (pdfPath) {
        links.push({
            label: language === 'zh' ? '打开 PDF' : 'Open PDF',
            href: pdfPath,
            kind: 'open_link',
        })
    }

    return {
        body: language === 'zh'
            ? '这是这张发票目前已确认的信息。'
            : 'These are the confirmed details for this invoice right now.',
        factRows: [
            ...(typeof invoiceContext?.data.invoiceNumber === 'string' && invoiceContext.data.invoiceNumber
                ? [{ label: language === 'zh' ? '发票号' : 'Invoice', value: invoiceContext.data.invoiceNumber, source: 'tool:getInvoiceContextByInvoiceId' as const }]
                : []),
            ...(typeof invoiceContext?.data.status === 'string' && invoiceContext.data.status
                ? [{ label: language === 'zh' ? '状态' : 'Status', value: invoiceContext.data.status, source: 'tool:getInvoiceContextByInvoiceId' as const }]
                : []),
            ...(typeof invoiceContext?.data.totalDue === 'number'
                ? [{ label: language === 'zh' ? '应付金额' : 'Total due', value: formatCurrency(invoiceContext.data.totalDue), source: 'tool:getInvoiceContextByInvoiceId' as const }]
                : []),
            ...(typeof invoiceContext?.data.depositAmount === 'number'
                ? [{ label: language === 'zh' ? '押金' : 'Deposit', value: formatCurrency(invoiceContext.data.depositAmount), source: 'tool:getInvoiceContextByInvoiceId' as const }]
                : []),
        ].slice(0, 8),
        links,
        intakePrompt: null,
    }
}

function buildAvailabilityPresentation(toolResults: CustomerServiceToolResult[], language: 'zh' | 'en'): CustomerServicePresentation {
    const availability = toolResults.find(result => result.toolName === 'getAvailabilityForItem')

    if (!availability) {
        return {
            body: language === 'zh'
                ? '我暂时还没有拿到这件作品的档期结果。'
                : 'I do not have the availability result for this piece yet.',
            factRows: [],
            links: [],
            intakePrompt: null,
        }
    }

    const requestedAvailable = availability.data.requestedAvailable
    const nextWindow = availability.data.nextAvailableWindow as { from?: string; to?: string } | null | undefined

    if (availability.data.dateFrom && availability.data.dateTo && requestedAvailable === false) {
        return {
            body: language === 'zh'
                ? '这件作品在您查询的日期目前不可用。'
                : 'This piece is not available for the date window you asked about.',
            factRows: [
                { label: language === 'zh' ? '查询日期' : 'Requested dates', value: `${availability.data.dateFrom} - ${availability.data.dateTo}`, source: 'tool:getAvailabilityForItem' },
                ...(nextWindow?.from && nextWindow?.to
                    ? [{ label: language === 'zh' ? '最近可用窗口' : 'Next available window', value: `${nextWindow.from} - ${nextWindow.to}`, source: 'tool:getAvailabilityForItem' as const }]
                    : []),
            ],
            links: [],
            intakePrompt: null,
        }
    }

    if (availability.data.dateFrom && availability.data.dateTo && requestedAvailable === true) {
        return {
            body: language === 'zh'
                ? '这件作品在您查询的日期目前可安排。'
                : 'This piece is currently available for the date window you asked about.',
            factRows: [
                { label: language === 'zh' ? '查询日期' : 'Requested dates', value: `${availability.data.dateFrom} - ${availability.data.dateTo}`, source: 'tool:getAvailabilityForItem' },
            ],
            links: [],
            intakePrompt: null,
        }
    }

    return {
        body: language === 'zh'
            ? '我可以为您核对这件作品的档期。只要把日期告诉我，我就按那个时间窗口来查。'
            : 'I can check the availability for this piece as soon as you share the date window.',
        factRows: [],
        links: [],
        intakePrompt: language === 'zh'
            ? '请告诉我希望使用的日期。'
            : 'Please share the dates you have in mind.',
    }
}

function buildIntakePresentation(language: 'zh' | 'en', draft?: RentalIntentDraft | null): CustomerServicePresentation {
    if (!draft) {
        return {
            body: language === 'zh'
                ? '我可以先帮您整理一份租赁意向。'
                : 'I can begin structuring the rental brief for you.',
            factRows: [],
            links: [],
            intakePrompt: null,
        }
    }

    const ready = draft.missing_fields.length === 0
    const factRows: CustomerServiceFactRow[] = []
    const addRow = (label: string, value: string | null | undefined) => {
        if (!value) return
        factRows.push({ label, value, source: 'page:intake' })
    }

    addRow(language === 'zh' ? '场合' : 'Occasion', draft.occasion || null)
    addRow(language === 'zh' ? '日期' : 'Dates', draft.date_window.raw || (draft.date_window.from && draft.date_window.to ? `${draft.date_window.from} - ${draft.date_window.to}` : null))
    addRow(language === 'zh' ? '时长' : 'Duration', draft.duration_days ? `${draft.duration_days} ${language === 'zh' ? '天' : draft.duration_days === 1 ? 'day' : 'days'}` : null)
    addRow(language === 'zh' ? '地点' : 'Location', draft.city_or_event_location || null)
    addRow(language === 'zh' ? '预算' : 'Budget', draft.budget_range || null)
    addRow(language === 'zh' ? '风格' : 'Style', draft.style_keywords.length > 0 ? draft.style_keywords.join(', ') : null)
    addRow(language === 'zh' ? '偏好品牌' : 'Preferred brands', draft.brand_preferences.length > 0 ? draft.brand_preferences.join(', ') : null)
    addRow(language === 'zh' ? '指定作品' : 'Requested pieces', draft.specific_items.length > 0 ? draft.specific_items.join(', ') : null)

    return {
        body: ready
            ? (language === 'zh'
                ? '我已经把这次租赁需求整理好了。接下来您可以继续进入 request 流程。'
                : 'I have structured the rental brief for you, and you can continue into the request flow.')
            : (language === 'zh'
                ? '我先把目前已确认的需求记下来，再继续补齐其余细节。'
                : 'I will keep the confirmed details here while we fill in the remaining pieces.'),
        factRows: factRows.slice(0, 8),
        links: ready
            ? [{
                label: language === 'zh' ? '继续填写 Request' : 'Continue to request',
                kind: 'apply_intake',
            }]
            : [],
        intakePrompt: ready ? null : (language === 'zh'
            ? '我还需要再确认一点细节。'
            : 'I just need one more detail.'),
    }
}

function buildHandoffPresentation(input: {
    language: 'zh' | 'en'
    pageContext: CustomerServicePageContext
    handoff?: CustomerServiceHandoff | null
}): CustomerServicePresentation {
    const pdfHref = input.pageContext.paymentConfirmation?.pdfUrl
        || (input.pageContext.paymentConfirmation?.invoiceId
            ? `/payment-confirmation/${input.pageContext.paymentConfirmation.invoiceId}/pdf`
            : null)

    return {
        body: input.language === 'zh'
            ? `我已为您安排专属顾问。${input.handoff ? `${input.handoff.ownerLabel} 将在 ${input.handoff.slaLabel} 与您联系。` : '稍后会与您联系。'}`
            : `I have arranged a dedicated advisor.${input.handoff ? ` ${input.handoff.ownerLabel} will contact you ${input.handoff.slaLabel}.` : ' The team will be in touch shortly.'}`,
        factRows: [],
        links: pdfHref
            ? [{
                label: input.language === 'zh' ? '查看当前文件' : 'Open current document',
                href: pdfHref,
                kind: 'open_link',
            }]
            : [],
        intakePrompt: null,
    }
}

function buildPresentation(input: {
    responseLanguage: 'zh' | 'en'
    pageContext: CustomerServicePageContext
    toolResults: CustomerServiceToolResult[]
    interactionKind: CustomerServiceInteractionKind
    rentalIntentDraft?: RentalIntentDraft | null
    handoff?: CustomerServiceHandoff | null
}) {
    switch (input.interactionKind) {
        case 'fact_lookup': {
            if (input.toolResults.some(result => result.toolName === 'getRequestStatusByEmailAndFingerprint')) {
                return buildOrderPresentation(input.toolResults, input.responseLanguage)
            }
            if (
                input.toolResults.some(result => result.toolName === 'getInvoiceContextByInvoiceId')
                || input.toolResults.some(result => result.toolName === 'getPublicPdfLink')
            ) {
                return buildInvoicePresentation(input.toolResults, input.responseLanguage)
            }
            if (input.toolResults.some(result => result.toolName === 'getAvailabilityForItem')) {
                return buildAvailabilityPresentation(input.toolResults, input.responseLanguage)
            }
            return buildProductFactsPresentation(input.toolResults, input.responseLanguage)
        }
        case 'rental_intent_intake':
            return buildIntakePresentation(input.responseLanguage, input.rentalIntentDraft)
        case 'human_handoff':
            return buildHandoffPresentation({
                language: input.responseLanguage,
                pageContext: input.pageContext,
                handoff: input.handoff,
            })
        default:
            return buildGreetingPresentation(input.responseLanguage)
    }
}

export async function generateCustomerServiceReply(input: {
    message: string
    pageContext: CustomerServicePageContext
    identityHints?: CustomerServiceIdentityHints | null
    toolResults: CustomerServiceToolResult[]
    responseLanguage: 'zh' | 'en'
    directReplySeed?: string | null
    replyMode?: CustomerServiceReplyMode
    decisionId: string
    interactionKind: CustomerServiceInteractionKind
    rentalIntentDraft?: RentalIntentDraft | null
    handoff?: CustomerServiceHandoff | null
}) {
    void input.message
    void input.identityHints
    void input.directReplySeed
    void input.replyMode
    void input.decisionId

    const presentation = buildPresentation({
        responseLanguage: input.responseLanguage,
        pageContext: input.pageContext,
        toolResults: input.toolResults,
        interactionKind: input.interactionKind,
        rentalIntentDraft: input.rentalIntentDraft,
        handoff: input.handoff,
    })

    return presentation.body
}

export async function streamCustomerServiceReply(input: {
    message: string
    pageContext: CustomerServicePageContext
    identityHints?: CustomerServiceIdentityHints | null
    toolResults: CustomerServiceToolResult[]
    responseLanguage: 'zh' | 'en'
    directReplySeed?: string | null
    replyMode?: CustomerServiceReplyMode
    decisionId: string
    interactionKind: CustomerServiceInteractionKind
    rentalIntentDraft?: RentalIntentDraft | null
    handoff?: CustomerServiceHandoff | null
}) {
    const reply = await generateCustomerServiceReply(input)
    return (async function* () {
        for (let index = 0; index < reply.length; index += 80) {
            yield reply.slice(index, index + 80)
        }
    })()
}

export function buildCustomerServicePresentation(input: {
    responseLanguage: 'zh' | 'en'
    pageContext: CustomerServicePageContext
    toolResults: CustomerServiceToolResult[]
    interactionKind: CustomerServiceInteractionKind
    rentalIntentDraft?: RentalIntentDraft | null
    handoff?: CustomerServiceHandoff | null
}) {
    const presentation = buildPresentation(input)
    const factRows = presentation.factRows.filter(row => isValidFactSource(row.source))

    return {
        presentation: {
            ...presentation,
            factRows,
        },
        isValid: factRows.length === presentation.factRows.length,
    }
}
