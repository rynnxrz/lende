import { NextResponse } from 'next/server'
import { logAiDecisionEvent } from '@/lib/ai/decision-trace'
import {
    CUSTOMER_SERVICE_VERIFIED_WINDOW_SECONDS,
    hashChallengeToken,
    issueSessionCapability,
    upsertSessionCapabilityEntry,
} from '@/lib/customer-service/auth'
import { logCustomerServiceInternalError } from '@/lib/customer-service/errors'
import {
    getCustomerServiceSession,
    updateCustomerServiceSession,
} from '@/lib/customer-service/session-store'
import { customerServiceVerifyCompleteQuerySchema } from '@/lib/customer-service/schemas'
import { createServiceClient } from '@/lib/supabase/server'

const FALLBACK_CATALOG_PATH = '/ivyjstudio/catalog'

function buildRedirect(path: string | null | undefined, status: 'success' | 'failed', request: Request) {
    const safePath = path && path.startsWith('/') ? path : FALLBACK_CATALOG_PATH
    const url = new URL(safePath, request.url)
    url.searchParams.set('verification', status)
    return NextResponse.redirect(url)
}

const MIN_VERIFICATION_RESPONSE_MS = 350

async function ensureMinimumVerificationDuration(startedAt: number) {
    const elapsed = Date.now() - startedAt
    if (elapsed >= MIN_VERIFICATION_RESPONSE_MS) return
    await new Promise(resolve => setTimeout(resolve, MIN_VERIFICATION_RESPONSE_MS - elapsed))
}

export async function GET(request: Request) {
    const startedAt = Date.now()
    const url = new URL(request.url)
    const parsed = customerServiceVerifyCompleteQuerySchema.safeParse({
        token: url.searchParams.get('token') || '',
        sessionId: url.searchParams.get('sessionId') || '',
    })
    const finish = async (path: string | null | undefined, status: 'success' | 'failed') => {
        await ensureMinimumVerificationDuration(startedAt)
        return buildRedirect(path, status, request)
    }

    if (!parsed.success) {
        return finish(FALLBACK_CATALOG_PATH, 'failed')
    }

    const { token, sessionId } = parsed.data
    const session = await getCustomerServiceSession(sessionId)
    const sessionOrgSlug = session?.pageContext?.orgSlug
    const sessionCatalogPath = sessionOrgSlug ? `/${sessionOrgSlug}/catalog` : FALLBACK_CATALOG_PATH
    const fallbackPath = session?.pageContext?.path || sessionCatalogPath

    if (!session) {
        return finish(FALLBACK_CATALOG_PATH, 'failed')
    }

    try {
        const tokenHash = hashChallengeToken(token)
        const now = new Date()
        const nowIso = now.toISOString()
        const supabase = createServiceClient()

        const { data: challenge } = await supabase
            .from('customer_service_email_challenges')
            .select('id, email, expires_at, consumed_at, attempt_count')
            .eq('session_id', session.id)
            .eq('token_hash', tokenHash)
            .order('last_sent_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        const isValidChallenge = Boolean(
            challenge
            && !challenge.consumed_at
            && typeof challenge.email === 'string'
            && typeof challenge.expires_at === 'string'
            && challenge.expires_at > nowIso
        )

        if (challenge) {
            await supabase
                .from('customer_service_email_challenges')
                .update({
                    attempt_count: Number(challenge.attempt_count || 0) + 1,
                    last_sent_at: nowIso,
                })
                .eq('id', challenge.id)
        }

        if (!isValidChallenge || !challenge) {
            if (session.decisionId) {
                await logAiDecisionEvent({
                    decisionId: session.decisionId,
                    stage: 'verification_complete',
                    level: 'warning',
                    message: 'Email verification failed due to invalid or expired token.',
                })
            }
            return finish(fallbackPath, 'failed')
        }

        const nextAuthVersion = Math.max(1, session.authVersion || 1) + 1
        const issued = issueSessionCapability(nextAuthVersion)
        const verifiedAt = nowIso
        const verifiedUntil = new Date(now.getTime() + CUSTOMER_SERVICE_VERIFIED_WINDOW_SECONDS * 1000).toISOString()
        const activeChallenge = challenge

        const { error: consumeError } = await supabase
            .from('customer_service_email_challenges')
            .update({
                consumed_at: nowIso,
            })
            .eq('id', activeChallenge.id)
            .is('consumed_at', null)

        if (consumeError) {
            throw consumeError
        }

        await updateCustomerServiceSession({
            sessionId: session.id,
            verifiedEmail: activeChallenge.email,
            verifiedAt,
            verifiedUntil,
            authVersion: nextAuthVersion,
            sessionSecretHash: issued.tokenHash,
        })

        await upsertSessionCapabilityEntry(session.id, issued.entry)

        if (session.decisionId) {
            await logAiDecisionEvent({
                decisionId: session.decisionId,
                stage: 'verification_complete',
                level: 'success',
                message: 'Email verification completed successfully.',
            })
        }

        return finish(fallbackPath, 'success')
    } catch (error) {
        logCustomerServiceInternalError('verify-complete-route', error, {
            sessionId,
        })

        if (session.decisionId) {
            try {
                await logAiDecisionEvent({
                    decisionId: session.decisionId,
                    stage: 'verification_complete',
                    level: 'error',
                    message: 'Email verification failed due to server error.',
                })
            } catch (logError) {
                logCustomerServiceInternalError('verify-complete-log', logError, {
                    sessionId,
                })
            }
        }

        return finish(fallbackPath, 'failed')
    }
}
