import type { Json } from '@/types'
import { createServiceClient } from '@/lib/supabase/service'

const toJsonValue = (value: unknown): Json => {
    if (value === null || value === undefined) {
        return null
    }

    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return value
    }

    if (Array.isArray(value)) {
        return value.map(entry => toJsonValue(entry))
    }

    if (typeof value === 'object') {
        const result: Record<string, Json | undefined> = {}
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            result[key] = entry === undefined ? undefined : toJsonValue(entry)
        }
        return result
    }

    return String(value)
}

export async function createAiDecision(input: {
    feature: string
    operation: string
    organizationId?: string | null
    provider?: string | null
    model?: string | null
    entityType?: string | null
    entityId?: string | null
    routeSnapshot?: Record<string, unknown>
    metadata?: Record<string, unknown>
}) {
    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('ai_decisions')
        .insert({
            feature: input.feature,
            operation: input.operation,
            organization_id: input.organizationId || null,
            provider: input.provider || null,
            model: input.model || null,
            entity_type: input.entityType || null,
            entity_id: input.entityId || null,
            route_snapshot: toJsonValue(input.routeSnapshot || {}),
            metadata: toJsonValue(input.metadata || {}),
        })
        .select('id')
        .single()

    if (error || !data) {
        throw new Error(error?.message || 'Failed to create AI decision')
    }

    return data.id
}

export async function logAiDecisionEvent(input: {
    decisionId: string
    stage: string
    level?: 'info' | 'success' | 'warning' | 'error'
    message: string
    payload?: Record<string, unknown>
}) {
    const supabase = createServiceClient()
    const { data: parent, error: parentError } = await supabase
        .from('ai_decisions')
        .select('organization_id')
        .eq('id', input.decisionId)
        .single()

    if (parentError || !parent) {
        throw new Error(parentError?.message || 'Decision not found for event')
    }

    const { error } = await supabase
        .from('ai_decision_events')
        .insert({
            decision_id: input.decisionId,
            organization_id: parent.organization_id,
            stage: input.stage,
            level: input.level || 'info',
            message: input.message,
            payload: toJsonValue(input.payload || {}),
        })

    if (error) {
        throw new Error(error.message)
    }
}

export async function completeAiDecision(input: {
    decisionId: string
    status: 'completed' | 'failed' | 'needs_review'
    provider?: string | null
    model?: string | null
    errorMessage?: string | null
    metadata?: Record<string, unknown>
}) {
    const supabase = createServiceClient()
    const updatePayload: Record<string, unknown> = {
        status: input.status,
        provider: input.provider || null,
        model: input.model || null,
        error_message: input.errorMessage || null,
        completed_at: new Date().toISOString(),
    }

    if (input.metadata) {
        updatePayload.metadata = toJsonValue(input.metadata)
    }

    const { error } = await supabase
        .from('ai_decisions')
        .update(updatePayload)
        .eq('id', input.decisionId)

    if (error) {
        throw new Error(error.message)
    }
}

export async function recordAiFeedback(input: {
    decisionId: string
    source: string
    fieldName: string
    originalValue: unknown
    correctedValue: unknown
    metadata?: Record<string, unknown>
}) {
    const supabase = createServiceClient()
    const { error } = await supabase
        .from('ai_feedback')
        .insert({
            decision_id: input.decisionId,
            source: input.source,
            field_name: input.fieldName,
            original_value: toJsonValue(input.originalValue),
            corrected_value: toJsonValue(input.correctedValue),
            metadata: toJsonValue(input.metadata || {}),
        })

    if (error) {
        throw new Error(error.message)
    }
}
