import { z } from 'zod'

export const customerServiceToolNames = [
    'getCatalogFacts',
    'getRequestStatusByEmailAndFingerprint',
    'getInvoiceContextByInvoiceId',
    'getPublicPdfLink',
    'getAvailabilityForItem',
    'createHumanHandoff',
] as const

export const customerServicePageTypes = [
    'catalog_list',
    'catalog_item',
    'wholesale_gate',
    'request_summary',
    'request_success',
    'payment_confirmation',
] as const

export const customerServiceSessionStatuses = [
    'planning',
    'awaiting_confirmation',
    'executing',
    'completed',
    'failed',
] as const

export const customerServiceMessageRoles = ['user', 'assistant', 'tool'] as const
export const customerServiceMessageKinds = ['message', 'plan', 'tool_result', 'feedback', 'system'] as const
export const customerServicePlanStatuses = ['needs_confirmation', 'needs_verification', 'completed', 'needs_identity', 'error'] as const
export const customerServiceRouteKinds = ['deterministic', 'llm'] as const
export const customerServiceReplyModes = ['structured_safe', 'guided_natural'] as const
export const customerServiceInteractionKinds = ['fact_lookup', 'rental_intent_intake', 'human_handoff', 'general_greeting'] as const

export const customerServiceToolNameSchema = z.enum(customerServiceToolNames)
export const customerServicePageTypeSchema = z.enum(customerServicePageTypes)
export const customerServiceSessionStatusSchema = z.enum(customerServiceSessionStatuses)
export const customerServiceMessageRoleSchema = z.enum(customerServiceMessageRoles)
export const customerServiceMessageKindSchema = z.enum(customerServiceMessageKinds)
export const customerServicePlanStatusSchema = z.enum(customerServicePlanStatuses)
export const customerServiceRouteKindSchema = z.enum(customerServiceRouteKinds)
export const customerServiceReplyModeSchema = z.enum(customerServiceReplyModes)
export const customerServiceInteractionKindSchema = z.enum(customerServiceInteractionKinds)

export const customerServiceIdentityHintsSchema = z.object({
    email: z.string().email().nullable().optional(),
    fingerprint: z.string().trim().min(3).nullable().optional(),
}).strict()

export const customerServiceItemContextSchema = z.object({
    id: z.string(),
    name: z.string(),
    category: z.string().nullable().optional(),
    rentalPrice: z.number().nullable().optional(),
    replacementCost: z.number().nullable().optional(),
    material: z.string().nullable().optional(),
    weight: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    specs: z.record(z.string(), z.string()).default({}).optional(),
}).strict()

export const customerServiceRequestSummarySchema = z.object({
    itemCount: z.number().int().nonnegative(),
    items: z.array(z.object({
        id: z.string(),
        name: z.string(),
        rentalPrice: z.number().nullable().optional(),
    }).strict()).max(20).default([]),
    dateFrom: z.string().nullable().optional(),
    dateTo: z.string().nullable().optional(),
    days: z.number().int().nonnegative().optional(),
    totalEstimate: z.number().nonnegative().optional(),
}).strict()

export const customerServicePaymentContextSchema = z.object({
    invoiceId: z.string(),
    invoiceNumber: z.string().nullable().optional(),
    totalDue: z.number().nullable().optional(),
    subtotalAmount: z.number().nullable().optional(),
    discountAmount: z.number().nullable().optional(),
    depositAmount: z.number().nullable().optional(),
    pdfUrl: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
}).strict()

export const customerServicePageContextSchema = z.object({
    pageType: customerServicePageTypeSchema,
    path: z.string(),
    orgSlug: z.string().optional(),
    item: customerServiceItemContextSchema.optional(),
    catalog: z.object({
        mode: z.enum(['rental', 'wholesale']).optional(),
        itemCount: z.number().int().nonnegative().optional(),
        selectedCategoryId: z.string().nullable().optional(),
        selectedCollectionId: z.string().nullable().optional(),
        dateFrom: z.string().nullable().optional(),
        dateTo: z.string().nullable().optional(),
    }).strict().optional(),
    requestSummary: customerServiceRequestSummarySchema.optional(),
    paymentConfirmation: customerServicePaymentContextSchema.optional(),
    requestSuccess: z.object({
        latestFingerprint: z.string().nullable().optional(),
        latestEmail: z.string().nullable().optional(),
    }).strict().optional(),
    wholesale: z.object({
        authenticated: z.boolean().optional(),
    }).strict().optional(),
}).strict()

export const customerServiceToolArgsSchema = z.record(z.string(), z.unknown())

export const customerServicePlanStepSchema = z.object({
    id: z.string(),
    title: z.string(),
    kind: z.enum(['assistant', 'tool', 'collect_identity']),
    toolName: customerServiceToolNameSchema.optional(),
    args: customerServiceToolArgsSchema.optional(),
}).strict()

export const customerServiceVerificationContextSchema = z.object({
    emailMasked: z.string(),
    method: z.literal('magic_link'),
}).strict()

export const customerServiceFactRowSchema = z.object({
    label: z.string(),
    value: z.string(),
    source: z.string().regex(/^(tool:[A-Za-z0-9_.-]+|page:[A-Za-z0-9_.-]+)$/),
}).strict()

export const customerServicePresentationLinkSchema = z.object({
    label: z.string(),
    href: z.string().optional(),
    kind: z.enum(['open_link', 'apply_intake', 'start_handoff']).default('open_link'),
}).strict()

export const customerServicePresentationSchema = z.object({
    body: z.string(),
    factRows: z.array(customerServiceFactRowSchema).max(8).default([]),
    links: z.array(customerServicePresentationLinkSchema).max(4).default([]),
    intakePrompt: z.string().nullable().optional(),
}).strict()

export const rentalIntentDraftSchema = z.object({
    date_window: z.object({
        from: z.string().nullable().optional(),
        to: z.string().nullable().optional(),
        raw: z.string().nullable().optional(),
    }).strict().default({ raw: null }),
    duration_days: z.number().int().positive().nullable().optional(),
    city_or_event_location: z.string().nullable().optional(),
    budget_range: z.string().nullable().optional(),
    occasion: z.string().nullable().optional(),
    style_keywords: z.array(z.string()).max(8).default([]),
    brand_preferences: z.array(z.string()).max(8).default([]),
    specific_items: z.array(z.string()).max(8).default([]),
    logistics_constraints: z.array(z.string()).max(8).default([]),
    notes: z.string().nullable().optional(),
    missing_fields: z.array(z.enum([
        'date_window',
        'duration_days',
        'city_or_event_location',
        'budget_range',
        'occasion',
    ])).default([]),
}).strict()

export const customerServiceHandoffSchema = z.object({
    handoffId: z.string(),
    ownerLabel: z.string(),
    slaLabel: z.string(),
    summary: z.string(),
}).strict()

export const customerServicePlanSchema = z.object({
    status: customerServicePlanStatusSchema,
    sessionId: z.string(),
    decisionId: z.string(),
    steps: z.array(customerServicePlanStepSchema),
    confirmationRequired: z.boolean(),
    previewReply: z.string(),
    missingIdentity: z.array(z.enum(['email', 'fingerprint'])).optional(),
    verificationRequired: z.boolean().default(false),
    verificationContext: customerServiceVerificationContextSchema.optional(),
    replyMode: customerServiceReplyModeSchema.default('guided_natural'),
    routeKind: customerServiceRouteKindSchema.default('deterministic'),
    interactionKind: customerServiceInteractionKindSchema.default('general_greeting'),
    presentation: customerServicePresentationSchema.default({
        body: '',
        factRows: [],
        links: [],
        intakePrompt: null,
    }),
    rentalIntentDraft: rentalIntentDraftSchema.optional(),
    handoff: customerServiceHandoffSchema.optional(),
}).strict()

export const customerServiceSessionMessageSchema = z.object({
    id: z.string(),
    role: customerServiceMessageRoleSchema,
    kind: customerServiceMessageKindSchema,
    text: z.string(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    decisionId: z.string().nullable(),
    createdAt: z.string(),
}).strict()

export const customerServiceSessionVerificationSchema = z.object({
    verified: z.boolean(),
    emailMasked: z.string().optional(),
    expiresAt: z.string().optional(),
}).strict()

export const customerServiceSessionRecordSchema = z.object({
    id: z.string(),
    status: customerServiceSessionStatusSchema,
    pendingPlan: customerServicePlanSchema.nullable(),
    pageContext: customerServicePageContextSchema,
    identitySnapshot: customerServiceIdentityHintsSchema.catch({}),
    decisionId: z.string().nullable(),
    sessionSecretHash: z.string().nullable().optional(),
    verifiedEmail: z.string().email().nullable().optional(),
    verifiedAt: z.string().nullable().optional(),
    verifiedUntil: z.string().nullable().optional(),
    authVersion: z.number().int().positive().default(1),
    lastActiveAt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
}).strict()

export const customerServicePlanRequestSchema = z.object({
    message: z.string().trim().min(1).max(4000),
    sessionId: z.string().nullable().optional(),
    pageContext: customerServicePageContextSchema,
    identityHints: customerServiceIdentityHintsSchema.optional(),
}).strict()

export const customerServiceExecuteRequestSchema = z.object({
    sessionId: z.string(),
    decisionId: z.string(),
    approved: z.boolean(),
}).strict()

export const customerServiceFeedbackRequestSchema = z.object({
    sessionId: z.string(),
    decisionId: z.string(),
    messageId: z.string().nullable().optional(),
    helpful: z.boolean(),
    note: z.string().trim().max(1000).nullable().optional(),
}).strict()

export const customerServiceVerifyStartRequestSchema = z.object({
    sessionId: z.string(),
    email: z.string().trim().email(),
}).strict()

export const customerServiceVerifyCompleteQuerySchema = z.object({
    sessionId: z.string(),
    token: z.string().trim().min(20),
}).strict()

export type CustomerServiceToolName = z.infer<typeof customerServiceToolNameSchema>
export type CustomerServicePageContext = z.infer<typeof customerServicePageContextSchema>
export type CustomerServiceIdentityHints = z.infer<typeof customerServiceIdentityHintsSchema>
export type CustomerServicePlanStep = z.infer<typeof customerServicePlanStepSchema>
export type CustomerServiceVerificationContext = z.infer<typeof customerServiceVerificationContextSchema>
export type CustomerServiceReplyMode = z.infer<typeof customerServiceReplyModeSchema>
export type CustomerServiceRouteKind = z.infer<typeof customerServiceRouteKindSchema>
export type CustomerServiceInteractionKind = z.infer<typeof customerServiceInteractionKindSchema>
export type CustomerServiceFactRow = z.infer<typeof customerServiceFactRowSchema>
export type CustomerServicePresentationLink = z.infer<typeof customerServicePresentationLinkSchema>
export type CustomerServicePresentation = z.infer<typeof customerServicePresentationSchema>
export type RentalIntentDraft = z.infer<typeof rentalIntentDraftSchema>
export type CustomerServiceHandoff = z.infer<typeof customerServiceHandoffSchema>
export type CustomerServicePlan = z.infer<typeof customerServicePlanSchema>
export type CustomerServiceSessionMessage = z.infer<typeof customerServiceSessionMessageSchema>
export type CustomerServiceSessionVerification = z.infer<typeof customerServiceSessionVerificationSchema>
export type CustomerServiceSessionRecord = z.infer<typeof customerServiceSessionRecordSchema>
export type CustomerServicePlanRequest = z.infer<typeof customerServicePlanRequestSchema>
export type CustomerServiceExecuteRequest = z.infer<typeof customerServiceExecuteRequestSchema>
export type CustomerServiceFeedbackRequest = z.infer<typeof customerServiceFeedbackRequestSchema>
export type CustomerServiceVerifyStartRequest = z.infer<typeof customerServiceVerifyStartRequestSchema>
export type CustomerServiceVerifyCompleteQuery = z.infer<typeof customerServiceVerifyCompleteQuerySchema>

export type CustomerServiceToolCall = {
    toolName: CustomerServiceToolName
    args: Record<string, unknown>
    title: string
}

export type CustomerServiceHeuristicDecision = {
    intent:
        | 'fact_lookup.order_status'
        | 'fact_lookup.invoice_status'
        | 'fact_lookup.invoice_pdf'
        | 'fact_lookup.product_specs'
        | 'fact_lookup.availability'
        | 'rental_intent_intake'
        | 'human_handoff'
        | 'general_greeting'
        | 'unsupported'
    responseLanguage: 'zh' | 'en'
    toolCalls: CustomerServiceToolCall[]
    needsIdentity: boolean
    missingIdentity: Array<'email' | 'fingerprint'>
    previewReply: string
    directReplySeed: string | null
    routeKind: CustomerServiceRouteKind
    confidence: 'high' | 'low'
    interactionKind: CustomerServiceInteractionKind
    rentalIntentDraft?: RentalIntentDraft
}

export type CustomerServiceToolResult = {
    toolName: CustomerServiceToolName
    summary: string
    data: Record<string, unknown>
}
