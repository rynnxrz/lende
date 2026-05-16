'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Bot,
    CheckCircle2,
    Loader2,
    MessageSquareMore,
    Send,
    ThumbsDown,
    ThumbsUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import {
    detectCustomerServiceLanguage,
    getCustomerServiceFriendlyErrorMessage,
    getCustomerServiceSafeErrorMessage,
} from '@/lib/customer-service/errors'
import { formatRentalIntentDraftForNotes } from '@/lib/customer-service/intake-format'
import { cn } from '@/lib/utils'
import { useRequestStore } from '@/store/request'
import { computeRentalChargeFromRetail, inferRetailValueFromCharge } from '@/lib/invoice/pricing'
import type {
    CustomerServiceIdentityHints,
    CustomerServicePageContext,
    CustomerServicePlan,
    CustomerServicePresentation,
    CustomerServicePresentationLink,
    CustomerServiceSessionMessage,
    CustomerServiceSessionVerification,
    CustomerServiceVerificationContext,
    RentalIntentDraft,
} from '@/lib/customer-service/schemas'

type WidgetMessage = CustomerServiceSessionMessage & {
    feedbackState?: 'idle' | 'pending' | 'submitted'
    feedbackChoice?: 'helpful' | 'not_helpful' | null
}

type ExecutionEvent =
    | { type: 'stage'; value: 'planning' | 'verification' | 'approval' | 'tool' | 'render' | 'done' }
    | { type: 'status'; message: string }
    | { type: 'tool_result'; toolName: string; summary: string }
    | { type: 'assistant_delta'; delta: string }
    | { type: 'final'; messageId: string; reply: string; presentation?: CustomerServicePresentation }
    | { type: 'error'; message: string }

interface CustomerServiceWidgetProps {
    baseContext: CustomerServicePageContext
    storageKey: string
    initialIdentityHints?: CustomerServiceIdentityHints
}

type PlanPayload = CustomerServicePlan & {
    messageId?: string
    error?: string
}

type SessionPayload = {
    session: {
        pendingPlan: CustomerServicePlan | null
        verification: CustomerServiceSessionVerification
    }
    messages: WidgetMessage[]
    error?: string
}

type ErrorPayload = {
    error?: string
    verificationRequired?: boolean
    verificationContext?: CustomerServiceVerificationContext
}

const SENSITIVE_TOOLS = new Set([
    'getRequestStatusByEmailAndFingerprint',
    'getInvoiceContextByInvoiceId',
    'getPublicPdfLink',
])

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const WIDGET_COPY = {
    zh: {
        verificationSuccess: '邮箱验证已完成，我来继续刚才的查询。',
        verificationFailed: '验证链接已失效，您可以在对话里重新发送。',
        invalidEmail: '请输入有效邮箱。',
        verificationEmailSent: '验证链接已发送，请查收邮箱。',
        feedbackPrompt: '告诉我们哪里还不够贴合（可选）',
        feedbackThanks: '感谢反馈，已收到。',
        intakeApplied: '已为您整理到 request 流程。',
        emptyState: '您可以问订单进度、发票状态、当前作品规格、指定作品档期，或让我先整理一份租赁意向。',
        verificationInlineWithEmail: (emailMasked: string) => `我先用 ${emailMasked} 完成一次邮箱验证，验证后会自动继续刚才的问题。`,
        verificationInlineNoEmail: '为保护您的订单与发票信息，我先用邮箱验证一下，验证后会自动继续刚才的问题。',
        sendVerificationLink: '发送验证链接',
        syncingSession: '正在同步对话…',
    },
    en: {
        verificationSuccess: "Email verification is complete. I'll continue your previous lookup now.",
        verificationFailed: 'That verification link has expired. You can request a new one in chat.',
        invalidEmail: 'Please enter a valid email address.',
        verificationEmailSent: 'Verification link sent. Please check your inbox.',
        feedbackPrompt: 'Tell us what did not fit yet (optional).',
        feedbackThanks: 'Thanks, your feedback was recorded.',
        intakeApplied: 'Your rental brief has been applied to the request flow.',
        emptyState: 'You can ask about order progress, invoice status, current piece specs, availability for a specific piece, or ask me to draft a rental brief first.',
        verificationInlineWithEmail: (emailMasked: string) => `I will verify ${emailMasked} first, then continue your previous question automatically.`,
        verificationInlineNoEmail: 'To protect order and invoice details, I will verify your email first, then continue your previous question automatically.',
        sendVerificationLink: 'Send verification link',
        syncingSession: 'Syncing chat...',
    },
} as const

const planNeedsStepUp = (plan: CustomerServicePlan | null | undefined, verified: boolean) => {
    if (!plan) return false
    if (verified) return false
    if (plan.verificationRequired) return true
    return plan.steps.some(step => step.kind === 'tool' && step.toolName && SENSITIVE_TOOLS.has(step.toolName))
}

const resolveEstimatedItemCharge = (
    item: { rental_price: number; replacement_cost?: number | null },
    days: number
) => {
    const safeDays = Math.max(0, Math.floor(days))
    if (safeDays <= 0) return 0

    if (item.replacement_cost != null && Number.isFinite(Number(item.replacement_cost))) {
        return computeRentalChargeFromRetail({
            retailPrice: item.replacement_cost,
            rentalDays: safeDays,
        })
    }

    const inferredRetail = inferRetailValueFromCharge(item.rental_price * 7, 7)
    if (typeof inferredRetail === 'number' && Number.isFinite(inferredRetail)) {
        return computeRentalChargeFromRetail({
            retailPrice: inferredRetail,
            rentalDays: safeDays,
        })
    }

    return item.rental_price * safeDays
}

async function readJsonPayload<T>(response: Response): Promise<T | null> {
    try {
        return await response.json() as T
    } catch {
        return null
    }
}

async function parseNdjsonStream<T>(response: Response, onEvent: (event: T) => void) {
    if (!response.body) {
        throw new Error('The response stream is unavailable.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split('\n')
            buffer = parts.pop() || ''

            for (const part of parts) {
                if (!part.trim()) continue
                onEvent(JSON.parse(part) as T)
            }
        }

        if (buffer.trim()) {
            onEvent(JSON.parse(buffer) as T)
        }
    } finally {
        reader.releaseLock()
    }
}

function parsePresentation(value: unknown): CustomerServicePresentation | null {
    if (!value || typeof value !== 'object') return null

    const record = value as Record<string, unknown>
    if (typeof record.body !== 'string') return null

    return {
        body: record.body,
        factRows: Array.isArray(record.factRows)
            ? record.factRows.flatMap((row) => {
                if (!row || typeof row !== 'object') return []
                const candidate = row as Record<string, unknown>
                if (typeof candidate.label !== 'string' || typeof candidate.value !== 'string' || typeof candidate.source !== 'string') {
                    return []
                }
                return [{
                    label: candidate.label,
                    value: candidate.value,
                    source: candidate.source,
                }]
            })
            : [],
        links: Array.isArray(record.links)
            ? record.links.flatMap((link) => {
                if (!link || typeof link !== 'object') return []
                const candidate = link as Record<string, unknown>
                if (typeof candidate.label !== 'string') return []
                return [{
                    label: candidate.label,
                    href: typeof candidate.href === 'string' ? candidate.href : undefined,
                    kind: candidate.kind === 'apply_intake' || candidate.kind === 'start_handoff' ? candidate.kind : 'open_link',
                } satisfies CustomerServicePresentationLink]
            })
            : [],
        intakePrompt: typeof record.intakePrompt === 'string' ? record.intakePrompt : null,
    }
}

function parseRentalIntentDraft(value: unknown): RentalIntentDraft | null {
    if (!value || typeof value !== 'object') return null

    const record = value as Record<string, unknown>
    const dateWindow = record.date_window && typeof record.date_window === 'object'
        ? record.date_window as Record<string, unknown>
        : {}

    return {
        date_window: {
            from: typeof dateWindow.from === 'string' ? dateWindow.from : null,
            to: typeof dateWindow.to === 'string' ? dateWindow.to : null,
            raw: typeof dateWindow.raw === 'string' ? dateWindow.raw : null,
        },
        duration_days: typeof record.duration_days === 'number' ? record.duration_days : null,
        city_or_event_location: typeof record.city_or_event_location === 'string' ? record.city_or_event_location : null,
        budget_range: typeof record.budget_range === 'string' ? record.budget_range : null,
        occasion: typeof record.occasion === 'string' ? record.occasion : null,
        style_keywords: Array.isArray(record.style_keywords) ? record.style_keywords.map(String) : [],
        brand_preferences: Array.isArray(record.brand_preferences) ? record.brand_preferences.map(String) : [],
        specific_items: Array.isArray(record.specific_items) ? record.specific_items.map(String) : [],
        logistics_constraints: Array.isArray(record.logistics_constraints) ? record.logistics_constraints.map(String) : [],
        notes: typeof record.notes === 'string' ? record.notes : null,
        missing_fields: Array.isArray(record.missing_fields) ? record.missing_fields.map(String) as RentalIntentDraft['missing_fields'] : [],
    }
}

function getPresentationForMessage(message: WidgetMessage, pendingPlan: CustomerServicePlan | null) {
    if (message.kind === 'plan' && pendingPlan && pendingPlan.decisionId === message.decisionId) {
        return pendingPlan.presentation || null
    }
    return parsePresentation(message.metadata?.presentation)
}

function getDraftForMessage(message: WidgetMessage, pendingPlan: CustomerServicePlan | null) {
    if (message.kind === 'plan' && pendingPlan && pendingPlan.decisionId === message.decisionId) {
        return pendingPlan.rentalIntentDraft || null
    }
    return parseRentalIntentDraft(message.metadata?.rentalIntentDraft)
}

export function CustomerServiceWidget({
    baseContext,
    storageKey,
    initialIdentityHints,
}: CustomerServiceWidgetProps) {
    const router = useRouter()
    const {
        items,
        dateRange,
        contactInfo,
        setDateRange,
        setContactInfo,
    } = useRequestStore()

    const [open, setOpen] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [messages, setMessages] = useState<WidgetMessage[]>([])
    const [draft, setDraft] = useState('')
    const [pendingPlan, setPendingPlan] = useState<CustomerServicePlan | null>(null)
    const [sessionVerification, setSessionVerification] = useState<CustomerServiceSessionVerification>({ verified: false })
    const [verificationEmail, setVerificationEmail] = useState('')
    const [loadingSession, setLoadingSession] = useState(false)
    const [shouldAutoResume, setShouldAutoResume] = useState(false)
    const [isSubmitting, startSubmitTransition] = useTransition()
    const [isExecuting, startExecuteTransition] = useTransition()
    const [isStartingVerification, startVerificationTransition] = useTransition()
    const [runtimeIdentity, setRuntimeIdentity] = useState<CustomerServiceIdentityHints>({})
    const latestMessageRef = useRef<HTMLDivElement | null>(null)
    const autoResumedDecisionRef = useRef<string | null>(null)

    const resolveLanguage = (sample?: string | null) => {
        const latestUserMessage = [...messages].reverse().find(message => message.role === 'user')
        return detectCustomerServiceLanguage(sample || latestUserMessage?.text || draft)
    }
    const widgetCopy = WIDGET_COPY[resolveLanguage()]

    useEffect(() => {
        latestMessageRef.current?.scrollIntoView({ block: 'end' })
    }, [messages, pendingPlan, open])

    useEffect(() => {
        const nextIdentity: CustomerServiceIdentityHints = {
            ...initialIdentityHints,
        }
        const latestStoredEmail = window.sessionStorage.getItem('latest_submitted_request_email')
        const latestStoredFingerprint = window.sessionStorage.getItem('latest_submitted_request_fingerprint')

        nextIdentity.email = nextIdentity.email || latestStoredEmail || null
        nextIdentity.fingerprint = nextIdentity.fingerprint || latestStoredFingerprint || null

        if (baseContext.pageType === 'request_summary') {
            const currentFingerprint = window.sessionStorage.getItem('current_request_fingerprint')
            nextIdentity.email = contactInfo.email || nextIdentity.email || null
            nextIdentity.fingerprint = currentFingerprint || nextIdentity.fingerprint || null
        }

        if (baseContext.pageType === 'request_success') {
            nextIdentity.email = window.sessionStorage.getItem('latest_submitted_request_email') || nextIdentity.email || null
            nextIdentity.fingerprint = window.sessionStorage.getItem('latest_submitted_request_fingerprint') || nextIdentity.fingerprint || null
        }

        setRuntimeIdentity(nextIdentity)
    }, [baseContext.pageType, contactInfo.email, initialIdentityHints])

    useEffect(() => {
        const stored = window.sessionStorage.getItem(storageKey)
        if (!stored) return
        setSessionId(stored)
    }, [storageKey])

    useEffect(() => {
        const url = new URL(window.location.href)
        const verificationResult = url.searchParams.get('verification')
        if (!verificationResult) return

        if (verificationResult === 'success') {
            toast.success(widgetCopy.verificationSuccess)
            setOpen(true)
            setShouldAutoResume(true)
        } else if (verificationResult === 'failed') {
            toast.error(widgetCopy.verificationFailed)
            setOpen(true)
        }

        url.searchParams.delete('verification')
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }, [widgetCopy.verificationFailed, widgetCopy.verificationSuccess])

    useEffect(() => {
        if (!open || !sessionId) return
        let cancelled = false

        const loadSession = async () => {
            setLoadingSession(true)

            try {
                const response = await fetch(`/api/customer-service/session/${sessionId}`)
                if (!response.ok) {
                    window.sessionStorage.removeItem(storageKey)
                    if (!cancelled) {
                        setSessionId(null)
                        setMessages([])
                        setPendingPlan(null)
                        setSessionVerification({ verified: false })
                    }
                    return
                }

                const payload = await readJsonPayload<SessionPayload>(response)
                if (!payload) {
                    throw new Error(getCustomerServiceFriendlyErrorMessage('en', 'session'))
                }

                if (cancelled) return
                setMessages(payload.messages.map(message => ({
                    ...message,
                    feedbackState: 'idle',
                    feedbackChoice: null,
                })))
                setSessionVerification(payload.session.verification || { verified: false })
                setPendingPlan(payload.session.pendingPlan || null)
                if (!payload.session.verification?.verified) {
                    setVerificationEmail(current => current || runtimeIdentity.email || '')
                }
            } catch {
                if (!cancelled) {
                    toast.error(getCustomerServiceFriendlyErrorMessage('en', 'session'))
                }
            } finally {
                if (!cancelled) {
                    setLoadingSession(false)
                }
            }
        }

        void loadSession()

        return () => {
            cancelled = true
        }
    }, [open, runtimeIdentity.email, sessionId, storageKey])

    const resolvedContext = useMemo<CustomerServicePageContext>(() => {
        if (baseContext.pageType === 'request_summary') {
            const days = dateRange.from && dateRange.to
                ? Math.max(1, Math.round((new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime()) / (1000 * 60 * 60 * 24)) + 1)
                : 0
            const totalEstimate = items.reduce((sum, item) => sum + resolveEstimatedItemCharge(item, days), 0)

            return {
                ...baseContext,
                requestSummary: {
                    itemCount: items.length,
                    items: items.map(item => ({
                        id: item.id,
                        name: item.name,
                        rentalPrice: item.rental_price,
                    })),
                    dateFrom: dateRange.from,
                    dateTo: dateRange.to,
                    days,
                    totalEstimate,
                },
            }
        }

        if (baseContext.pageType === 'request_success') {
            return {
                ...baseContext,
                requestSuccess: {
                    latestEmail: runtimeIdentity.email || null,
                    latestFingerprint: runtimeIdentity.fingerprint || null,
                },
            }
        }

        if (baseContext.pageType === 'catalog_list' || baseContext.pageType === 'catalog_item') {
            return {
                ...baseContext,
                catalog: {
                    ...(baseContext.catalog || {}),
                    dateFrom: dateRange.from,
                    dateTo: dateRange.to,
                },
            }
        }

        return baseContext
    }, [baseContext, dateRange.from, dateRange.to, items, runtimeIdentity.email, runtimeIdentity.fingerprint])

    const pendingPlanNeedsVerification = planNeedsStepUp(pendingPlan, sessionVerification.verified)
    const displayMessages = useMemo(
        () => messages.filter(message => message.role !== 'tool'),
        [messages]
    )

    useEffect(() => {
        if (!pendingPlanNeedsVerification) return
        if (verificationEmail) return
        if (runtimeIdentity.email) {
            setVerificationEmail(runtimeIdentity.email)
        }
    }, [pendingPlanNeedsVerification, runtimeIdentity.email, verificationEmail])

    const runPlanExecution = (plan: CustomerServicePlan, approved: boolean) => {
        const language = resolveLanguage(plan.previewReply)

        if (approved && planNeedsStepUp(plan, sessionVerification.verified)) {
            setPendingPlan(current => current ? { ...current, verificationRequired: true } : current)
            return
        }

        startExecuteTransition(() => {
            void (async () => {
                try {
                    const response = await fetch('/api/customer-service/execute', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            sessionId: plan.sessionId,
                            decisionId: plan.decisionId,
                            approved,
                        }),
                    })

                    if (!approved) {
                        if (!response.ok) {
                            const payload = await readJsonPayload<ErrorPayload>(response)
                            throw new Error(payload?.error || getCustomerServiceFriendlyErrorMessage(language, 'cancel'))
                        }

                        setPendingPlan(null)
                        return
                    }

                    if (!response.ok) {
                        const payload = await readJsonPayload<ErrorPayload>(response)
                        if (payload?.verificationRequired) {
                            setSessionVerification({ verified: false })
                            setPendingPlan(current => current ? ({
                                ...current,
                                status: 'needs_verification',
                                verificationRequired: true,
                                verificationContext: payload.verificationContext || current.verificationContext,
                            }) : current)
                            return
                        }
                        throw new Error(payload?.error || getCustomerServiceFriendlyErrorMessage(language, 'execute'))
                    }

                    const assistantDraftId = `assistant-stream-${Date.now()}`
                    setPendingPlan(null)
                    setMessages(current => [
                        ...current,
                        {
                            id: assistantDraftId,
                            role: 'assistant',
                            kind: 'message',
                            text: '',
                            metadata: {},
                            decisionId: plan.decisionId,
                            createdAt: new Date().toISOString(),
                            feedbackState: 'idle',
                            feedbackChoice: null,
                        },
                    ])

                    await parseNdjsonStream<ExecutionEvent>(response, event => {
                        if (event.type === 'assistant_delta') {
                            setMessages(current => current.map(message =>
                                message.id === assistantDraftId
                                    ? { ...message, text: `${message.text}${event.delta}` }
                                    : message
                            ))
                            return
                        }

                        if (event.type === 'final') {
                            setMessages(current => current.map(message =>
                                message.id === assistantDraftId
                                    ? {
                                        ...message,
                                        id: event.messageId,
                                        text: event.reply,
                                        metadata: {
                                            ...message.metadata,
                                            presentation: event.presentation,
                                        },
                                    }
                                    : message
                            ))
                            return
                        }

                        if (event.type === 'error') {
                            setMessages(current => current.map(message =>
                                message.id === assistantDraftId
                                    ? { ...message, text: event.message }
                                    : message
                            ))
                        }
                    })
                } catch (error) {
                    const messageText = getCustomerServiceSafeErrorMessage({
                        error,
                        language,
                        context: approved ? 'execute' : 'cancel',
                    })

                    setMessages(current => [...current, {
                        id: `assistant-execute-error-${Date.now()}`,
                        role: 'assistant',
                        kind: 'message',
                        text: messageText,
                        metadata: {},
                        decisionId: plan.decisionId,
                        createdAt: new Date().toISOString(),
                        feedbackState: 'idle',
                        feedbackChoice: null,
                    }])
                }
            })()
        })
    }

    useEffect(() => {
        if (!shouldAutoResume || !pendingPlan || !sessionVerification.verified) return
        if (autoResumedDecisionRef.current === pendingPlan.decisionId) return

        autoResumedDecisionRef.current = pendingPlan.decisionId
        setShouldAutoResume(false)
        runPlanExecution(pendingPlan, true)
    }, [pendingPlan, sessionVerification.verified, shouldAutoResume])

    const handleSubmit = () => {
        const message = draft.trim()
        if (!message) return

        const tempUserMessage: WidgetMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            kind: 'message',
            text: message,
            metadata: {},
            decisionId: null,
            createdAt: new Date().toISOString(),
            feedbackState: 'idle',
            feedbackChoice: null,
        }

        setMessages(current => [...current, tempUserMessage])
        setDraft('')

        startSubmitTransition(() => {
            void (async () => {
                try {
                    const response = await fetch('/api/customer-service/plan', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            message,
                            sessionId,
                            pageContext: resolvedContext,
                            identityHints: runtimeIdentity,
                        }),
                    })

                    const payload = await readJsonPayload<PlanPayload>(response)
                    if (!payload) {
                        throw new Error(getCustomerServiceFriendlyErrorMessage(resolveLanguage(message), 'plan'))
                    }

                    if (!response.ok) {
                        if (response.status === 401 || response.status === 403 || response.status === 404) {
                            window.sessionStorage.removeItem(storageKey)
                            setSessionId(null)
                            setPendingPlan(null)
                            setSessionVerification({ verified: false })
                        }
                        throw new Error(payload.error || getCustomerServiceFriendlyErrorMessage(resolveLanguage(message), 'plan'))
                    }

                    if (payload.sessionId) {
                        setSessionId(payload.sessionId)
                        window.sessionStorage.setItem(storageKey, payload.sessionId)
                    }

                    if (payload.status === 'needs_identity') {
                        setPendingPlan(null)
                        setMessages(current => [...current, {
                            id: payload.messageId || `assistant-${Date.now()}`,
                            role: 'assistant',
                            kind: 'message',
                            text: payload.previewReply,
                            metadata: {
                                missingIdentity: payload.missingIdentity || [],
                                presentation: payload.presentation,
                                rentalIntentDraft: payload.rentalIntentDraft || null,
                            },
                            decisionId: payload.decisionId || null,
                            createdAt: new Date().toISOString(),
                            feedbackState: 'idle',
                            feedbackChoice: null,
                        }])
                        return
                    }

                    if (payload.verificationRequired || payload.status === 'needs_verification' || payload.confirmationRequired) {
                        setPendingPlan(payload)
                        if (payload.verificationRequired || payload.status === 'needs_verification') {
                            setSessionVerification({ verified: false })
                            setVerificationEmail(runtimeIdentity.email || '')
                        }
                        setMessages(current => [...current, {
                            id: `plan-${payload.decisionId}`,
                            role: 'assistant',
                            kind: 'plan',
                            text: payload.previewReply,
                            metadata: {
                                steps: payload.steps,
                                presentation: payload.presentation,
                                rentalIntentDraft: payload.rentalIntentDraft || null,
                            },
                            decisionId: payload.decisionId,
                            createdAt: new Date().toISOString(),
                            feedbackState: 'idle',
                            feedbackChoice: null,
                        }])
                        return
                    }

                    setPendingPlan(null)
                    runPlanExecution(payload, true)
                } catch (error) {
                    const messageText = getCustomerServiceSafeErrorMessage({
                        error,
                        language: resolveLanguage(message),
                        context: 'plan',
                    })
                    setMessages(current => [...current, {
                        id: `assistant-error-${Date.now()}`,
                        role: 'assistant',
                        kind: 'message',
                        text: messageText,
                        metadata: {},
                        decisionId: null,
                        createdAt: new Date().toISOString(),
                        feedbackState: 'idle',
                        feedbackChoice: null,
                    }])
                }
            })()
        })
    }

    const handleVerificationStart = () => {
        if (!pendingPlan || !sessionId) return
        const normalizedEmail = verificationEmail.trim().toLowerCase()
        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            toast.error(widgetCopy.invalidEmail)
            return
        }

        startVerificationTransition(() => {
            void (async () => {
                try {
                    const response = await fetch('/api/customer-service/verify/start', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            sessionId: pendingPlan.sessionId || sessionId,
                            email: normalizedEmail,
                        }),
                    })

                    if (!response.ok && response.status !== 429) {
                        throw new Error(getCustomerServiceFriendlyErrorMessage(resolveLanguage(), 'general'))
                    }

                    setRuntimeIdentity(current => ({
                        ...current,
                        email: normalizedEmail,
                    }))
                    toast.success(widgetCopy.verificationEmailSent)
                } catch (error) {
                    toast.error(getCustomerServiceSafeErrorMessage({
                        error,
                        language: resolveLanguage(),
                        context: 'general',
                    }))
                }
            })()
        })
    }

    const handleFeedback = (message: WidgetMessage, helpful: boolean) => {
        const feedbackCopy = WIDGET_COPY[resolveLanguage(message.text)]
        const feedbackChoice: WidgetMessage['feedbackChoice'] = helpful ? 'helpful' : 'not_helpful'
        const note = helpful ? null : window.prompt(feedbackCopy.feedbackPrompt)

        setMessages(current => current.map(entry =>
            entry.id === message.id
                ? { ...entry, feedbackState: 'pending', feedbackChoice }
                : entry
        ))

        if (!sessionId || !message.decisionId) {
            setMessages(current => current.map(entry =>
                entry.id === message.id
                    ? { ...entry, feedbackState: 'submitted', feedbackChoice }
                    : entry
            ))
            toast.success(feedbackCopy.feedbackThanks)
            return
        }

        startSubmitTransition(() => {
            void (async () => {
                try {
                    const response = await fetch('/api/customer-service/feedback', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            sessionId,
                            decisionId: message.decisionId,
                            messageId: message.id,
                            helpful,
                            note,
                        }),
                    })

                    if (!response.ok) {
                        const payload = await readJsonPayload<ErrorPayload>(response)
                        throw new Error(payload?.error || getCustomerServiceFriendlyErrorMessage(resolveLanguage(message.text), 'feedback'))
                    }

                    setMessages(current => current.map(entry =>
                        entry.id === message.id
                            ? { ...entry, feedbackState: 'submitted', feedbackChoice }
                            : entry
                    ))
                } catch (error) {
                    toast.error(getCustomerServiceSafeErrorMessage({
                        error,
                        language: resolveLanguage(message.text),
                        context: 'feedback',
                    }))
                    setMessages(current => current.map(entry =>
                        entry.id === message.id
                            ? { ...entry, feedbackState: 'idle', feedbackChoice: null }
                            : entry
                    ))
                }
            })()
        })
    }

    const handleApplyIntake = (draftToApply: RentalIntentDraft | null) => {
        if (!draftToApply) return

        if (draftToApply.date_window.from && draftToApply.date_window.to) {
            setDateRange({
                from: draftToApply.date_window.from,
                to: draftToApply.date_window.to,
            })
        }

        const intakeNotes = formatRentalIntentDraftForNotes(draftToApply)
        const existingNotes = contactInfo.notes?.trim()
        const nextNotes = existingNotes
            ? (existingNotes.includes(intakeNotes) ? existingNotes : `${existingNotes}\n\n${intakeNotes}`)
            : intakeNotes

        setContactInfo({
            event_location: draftToApply.city_or_event_location || contactInfo.event_location,
            notes: nextNotes,
            email: runtimeIdentity.email || contactInfo.email,
        })

        toast.success(widgetCopy.intakeApplied)
        setOpen(false)
        const slugPrefix = baseContext.orgSlug ? `/${baseContext.orgSlug}` : ''
        router.push(items.length > 0 ? `${slugPrefix}/request/summary` : `${slugPrefix}/catalog`)
    }

    const renderPresentation = (presentation: CustomerServicePresentation | null, draftForMessage: RentalIntentDraft | null) => {
        if (!presentation) return null

        return (
            <div className="mt-3 space-y-3 rounded-2xl border border-stone-200/80 bg-stone-50/80 p-3">
                {presentation.factRows.length > 0 ? (
                    <div className="space-y-2">
                        {presentation.factRows.map((fact, index) => (
                            <div key={`${fact.label}-${index}`} className="grid grid-cols-[88px_1fr] gap-3 text-sm">
                                <span className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                                    {fact.label}
                                </span>
                                <span className="text-stone-900">{fact.value}</span>
                            </div>
                        ))}
                    </div>
                ) : null}

                {presentation.intakePrompt ? (
                    <p className="text-sm text-stone-600">{presentation.intakePrompt}</p>
                ) : null}

                {presentation.links.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                        {presentation.links.map((link, index) => {
                            if (link.kind === 'apply_intake') {
                                return (
                                    <Button
                                        key={`${link.label}-${index}`}
                                        type="button"
                                        size="sm"
                                        className="h-8 rounded-full px-4"
                                        onClick={() => handleApplyIntake(draftForMessage)}
                                    >
                                        {link.label}
                                    </Button>
                                )
                            }

                            if (link.href) {
                                return (
                                    <a
                                        key={`${link.label}-${index}`}
                                        href={link.href}
                                        className="inline-flex h-8 items-center rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-800 transition-colors hover:bg-stone-100"
                                    >
                                        {link.label}
                                    </a>
                                )
                            }

                            return (
                                <span
                                    key={`${link.label}-${index}`}
                                    className="inline-flex h-8 items-center rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-500"
                                >
                                    {link.label}
                                </span>
                            )
                        })}
                    </div>
                ) : null}
            </div>
        )
    }

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <div className="fixed bottom-5 right-4 z-50 sm:bottom-6 sm:right-6">
                <SheetTrigger asChild>
                    <Button
                        type="button"
                        className="h-12 rounded-full px-4 shadow-lg shadow-slate-900/15"
                    >
                        <MessageSquareMore className="mr-2 h-4 w-4" />
                        Ask Ivy
                    </Button>
                </SheetTrigger>
            </div>

            <SheetContent className="flex w-full flex-col sm:max-w-xl">
                <SheetHeader className="border-b border-stone-200 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-stone-900 p-2 text-white">
                            <Bot className="h-4 w-4" />
                        </div>
                        <div>
                            <SheetTitle>Ask Ivy</SheetTitle>
                            <SheetDescription>
                                Read-only facts for orders, invoices, verified specs and availability, plus rental-intake support.
                            </SheetDescription>
                        </div>
                    </div>
                </SheetHeader>

                <ScrollArea className="mt-4 flex-1 pr-3">
                    <div className="space-y-4 pb-4">
                        {displayMessages.length === 0 ? (
                            <div className="rounded-3xl border border-stone-200 bg-stone-50 px-5 py-4 text-sm leading-7 text-stone-600">
                                {widgetCopy.emptyState}
                            </div>
                        ) : (
                            displayMessages.map(message => {
                                const presentation = getPresentationForMessage(message, pendingPlan)
                                const draftForMessage = getDraftForMessage(message, pendingPlan)
                                const isUser = message.role === 'user'
                                const isPendingVerificationPlan = Boolean(
                                    message.kind === 'plan'
                                    && pendingPlan
                                    && pendingPlan.decisionId === message.decisionId
                                    && pendingPlanNeedsVerification
                                )
                                const helpfulActive = message.feedbackChoice === 'helpful' && message.feedbackState !== 'idle'
                                const notHelpfulActive = message.feedbackChoice === 'not_helpful' && message.feedbackState !== 'idle'

                                return (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            'rounded-3xl border px-4 py-3 text-sm shadow-sm',
                                            isUser
                                                ? 'ml-8 border-stone-900 bg-stone-900 text-white'
                                                : message.kind === 'plan'
                                                    ? 'mr-8 border-stone-200 bg-stone-50 text-stone-900'
                                                    : 'mr-8 border-stone-200 bg-white text-stone-800'
                                        )}
                                    >
                                        <p className="whitespace-pre-wrap leading-7">{message.text || presentation?.body || '...'}</p>

                                        {renderPresentation(presentation, draftForMessage)}

                                        {isPendingVerificationPlan ? (
                                            <div className="mt-3 space-y-3 rounded-2xl border border-stone-200 bg-white/90 p-3">
                                                <p className="text-sm leading-6 text-stone-600">
                                                    {pendingPlan?.verificationContext?.emailMasked
                                                        ? widgetCopy.verificationInlineWithEmail(pendingPlan.verificationContext.emailMasked)
                                                        : widgetCopy.verificationInlineNoEmail}
                                                </p>
                                                <Input
                                                    value={verificationEmail}
                                                    onChange={event => setVerificationEmail(event.target.value)}
                                                    placeholder="name@example.com"
                                                    autoComplete="email"
                                                    className="bg-white"
                                                />
                                                <Button
                                                    type="button"
                                                    className="h-9 rounded-full px-4"
                                                    onClick={handleVerificationStart}
                                                    disabled={isStartingVerification || !verificationEmail.trim()}
                                                >
                                                    {isStartingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                    {widgetCopy.sendVerificationLink}
                                                </Button>
                                            </div>
                                        ) : null}

                                        {message.role === 'assistant' && message.kind === 'message' && message.text ? (
                                            <div className="mt-3 flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className={cn(
                                                        'h-8 rounded-full transition-all active:scale-95',
                                                        helpfulActive
                                                            ? 'border-stone-900 bg-stone-900 text-white hover:bg-stone-900'
                                                            : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-100'
                                                    )}
                                                    disabled={message.feedbackState === 'pending' || message.feedbackState === 'submitted'}
                                                    onClick={() => handleFeedback(message, true)}
                                                >
                                                    {helpfulActive ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <ThumbsUp className="mr-1 h-3.5 w-3.5" />}
                                                    Useful
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className={cn(
                                                        'h-8 rounded-full transition-all active:scale-95',
                                                        notHelpfulActive
                                                            ? 'border-stone-900 bg-stone-900 text-white hover:bg-stone-900'
                                                            : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-100'
                                                    )}
                                                    disabled={message.feedbackState === 'pending' || message.feedbackState === 'submitted'}
                                                    onClick={() => handleFeedback(message, false)}
                                                >
                                                    {notHelpfulActive ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <ThumbsDown className="mr-1 h-3.5 w-3.5" />}
                                                    Not useful
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                )
                            })
                        )}

                        {loadingSession ? (
                            <div className="flex items-center gap-2 px-2 text-sm text-stone-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {widgetCopy.syncingSession}
                            </div>
                        ) : null}

                        <div ref={latestMessageRef} />
                    </div>
                </ScrollArea>

                <div className="border-t border-stone-200 pt-4">
                    <div className="space-y-3">
                        <Textarea
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            rows={4}
                            placeholder="Ask about a verified fact, or let me structure a rental brief for you..."
                            className="resize-none"
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault()
                                    handleSubmit()
                                }
                            }}
                        />
                        <Button
                            type="button"
                            className="w-full rounded-full"
                            onClick={handleSubmit}
                            disabled={isSubmitting || isExecuting || !draft.trim()}
                        >
                            {(isSubmitting || isExecuting) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Send
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
