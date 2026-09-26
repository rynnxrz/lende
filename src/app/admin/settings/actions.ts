'use server'

import { createClient } from '@/lib/supabase/server'
import { createCollection as createItemCollection } from '@/actions/items'
import { revalidateAdminPath } from '@/lib/revalidate-admin'
import { healthCheckAiProvider, listAiModels } from '@/lib/ai/gateway'
import { healthCheckDocumentProvider } from '@/lib/ai/document-gateway'
import { loadAiSettings } from '@/lib/ai/settings'

export async function getCategories() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name')

    if (error) throw error
    return data
}

export async function getCollections() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('collections')
        .select('*')
        .order('name')

    if (error) throw error
    return data
}

export async function toggleCategoryVisibility(id: string, hidden: boolean) {
    const supabase = await createClient()

    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error } = await supabase
        .from('categories')
        .update({ hidden_in_portal: hidden })
        .eq('id', id)

    if (error) throw error
    revalidateAdminPath('/settings')
    return { success: true }
}

export async function toggleCollectionVisibility(id: string, hidden: boolean) {
    const supabase = await createClient()

    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error } = await supabase
        .from('collections')
        .update({ hidden_in_portal: hidden })
        .eq('id', id)

    if (error) throw error
    revalidateAdminPath('/settings')
    return { success: true }
}

export async function deleteCategory(id: string) {
    const supabase = await createClient()

    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)

    if (error) throw error
    revalidateAdminPath('/settings')
    return { success: true }
}

export async function deleteCollection(id: string) {
    const supabase = await createClient()

    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', id)

    if (error) throw error
    revalidateAdminPath('/settings')
    return { success: true }
}

const slugify = (value: string) => {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') || `item-${Date.now()}`
}

export async function createCategory(name: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const slug = slugify(name)
    const { error } = await supabase
        .from('categories')
        .insert({ name, slug })

    if (error) throw error
    revalidateAdminPath('/settings')
    return { success: true }
}

export async function createCollection(name: string) {
    const result = await createItemCollection(name)
    if (result.success) revalidateAdminPath('/settings')
    return result
}

// ============================================================================
// AI Settings Actions
// ============================================================================

export async function saveAISettingsAction(settings: {
    ai_provider: string
    ai_primary_model: string
    ai_primary_base_url: string | null
    ai_allow_fallback?: boolean
    ai_fallback_provider?: string | null
    ai_fallback_model?: string | null
    ai_fallback_base_url?: string | null
    ai_selected_model: string
    document_ai_provider: string
    document_ai_model?: string | null
    document_ai_base_url?: string | null
    ai_prompt_category: string | null
    ai_prompt_subcategory: string | null
    ai_prompt_product_list: string | null
    ai_prompt_quick_list?: string | null
    ai_prompt_product_detail: string | null
    ai_thinking_category?: string | null
    ai_thinking_subcategory?: string | null
    ai_thinking_product_list?: string | null
    ai_thinking_product_detail?: string | null
    ai_max_output_tokens?: number | null
    ai_use_system_instruction?: boolean
}) {
    console.log('\n📝 [AI Settings] Saving AI Configuration...')
    console.log('   ├─ Provider:', settings.ai_provider)
    console.log('   ├─ Primary Model:', settings.ai_primary_model)
    console.log('   ├─ Primary Base URL:', settings.ai_primary_base_url || 'default')
    console.log('   ├─ Allow Fallback:', settings.ai_allow_fallback ? '✓ Enabled' : '○ Disabled')
    console.log('   ├─ Fallback Provider:', settings.ai_fallback_provider || 'none')
    console.log('   ├─ Fallback Model:', settings.ai_fallback_model || 'none')
    console.log('   ├─ Document Provider:', settings.document_ai_provider)
    console.log('   ├─ Document Model:', settings.document_ai_model || 'default')
    console.log('   ├─ Document Base URL:', settings.document_ai_base_url || 'default')
    console.log('   ├─ Category Prompt:', settings.ai_prompt_category ? '✓ Custom set' : '○ Using default')
    console.log('   ├─ Subcategory Prompt:', settings.ai_prompt_subcategory ? '✓ Custom set' : '○ Using default')
    console.log('   ├─ Speed Scan Prompt:', settings.ai_prompt_quick_list ? '✓ Custom set' : '○ Using default')
    console.log('   ├─ Product List Prompt:', settings.ai_prompt_product_list ? '✓ Custom set' : '○ Using default')
    console.log('   ├─ Product Detail Prompt:', settings.ai_prompt_product_detail ? '✓ Custom set' : '○ Using default')
    console.log('   ├─ Thinking (Category):', settings.ai_thinking_category || 'default')
    console.log('   ├─ Thinking (Subcategory):', settings.ai_thinking_subcategory || 'default')
    console.log('   ├─ Thinking (Product List):', settings.ai_thinking_product_list || 'default')
    console.log('   ├─ Thinking (Product Detail):', settings.ai_thinking_product_detail || 'default')
    console.log('   ├─ Max Output Tokens:', settings.ai_max_output_tokens || 'default')
    console.log('   └─ Use System Instruction:', settings.ai_use_system_instruction ? '✓ Enabled' : '○ Disabled')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    // Fetch current row to get existing history
    const { data: existing, error: fetchError } = await supabase
        .from('app_settings')
        .select('id, prompt_history')
        .single()

    const missingHistoryColumn = !!fetchError?.message?.includes('prompt_history')
    const priorHistory = missingHistoryColumn
        ? {}
        : ((existing?.prompt_history as Record<string, string[]> | null) || {})
    const updateHistory = (key: string, value: string | null | undefined) => {
        if (!value) return priorHistory[key] || []
        const list = [value, ...(priorHistory[key] || [])].filter(Boolean)
        // Deduplicate while preserving order
        const deduped: string[] = []
        for (const entry of list) {
            if (!deduped.includes(entry) && deduped.length < 3) {
                deduped.push(entry)
            }
        }
        return deduped.slice(0, 3)
    }

    const prompt_history = {
        category: updateHistory('category', settings.ai_prompt_category),
        subcategory: updateHistory('subcategory', settings.ai_prompt_subcategory),
        quickList: updateHistory('quickList', settings.ai_prompt_quick_list ?? settings.ai_prompt_product_list),
        productList: updateHistory('productList', settings.ai_prompt_product_list),
        productDetail: updateHistory('productDetail', settings.ai_prompt_product_detail)
    }

    // Attempt full update first; if schema lacks new columns, fall back gracefully
    const fullPayload = {
        ...settings,
        ai_selected_model: settings.ai_primary_model || settings.ai_selected_model,
        document_ai_model: settings.document_ai_model?.trim() || null,
        document_ai_base_url: settings.document_ai_base_url?.trim() || null,
        prompt_history,
    }
    const legacyPayload = {
        ai_selected_model: settings.ai_primary_model || settings.ai_selected_model,
        ai_prompt_category: settings.ai_prompt_category,
        ai_prompt_subcategory: settings.ai_prompt_subcategory,
        ai_prompt_product_list: settings.ai_prompt_quick_list ?? settings.ai_prompt_product_list,
        ai_prompt_quick_list: settings.ai_prompt_quick_list ?? settings.ai_prompt_product_list,
        ai_prompt_product_detail: settings.ai_prompt_product_detail
    }

    const attemptUpdate = async (payload: Record<string, unknown>) =>
        supabase.from('app_settings').update(payload).eq('id', existing?.id || 1)

    let { error } = await attemptUpdate(fullPayload)

    if (error) {
        const isSchemaMissing =
            error.message?.includes('ai_provider') ||
            error.message?.includes('document_ai_') ||
            error.message?.includes('ai_thinking_') ||
            error.message?.includes('prompt_history') ||
            error.message?.includes('schema cache')

        if (isSchemaMissing) {
            console.warn('[AI Settings] Falling back to legacy columns (missing ai_thinking_* or prompt_history)')
            const fallback = await attemptUpdate(legacyPayload)
            error = fallback.error || null
        }
    }

    if (error) {
        console.log('❌ [AI Settings] Save failed:', error.message)
        const missingThinking = error.message?.includes('ai_thinking_')
        const missingPromptHistory = error.message?.includes('prompt_history')
        const missingProvider = error.message?.includes('ai_provider')
        const missingDocumentProvider = error.message?.includes('document_ai_')
        const hint =
            missingThinking || missingPromptHistory || missingProvider || missingDocumentProvider || error.message?.includes('schema cache')
                ? 'Missing AI settings columns in app_settings. Run the latest AI settings migrations, then NOTIFY pgrst, \'reload schema\'.'
                : error.message
        return { success: false, error: hint }
    }

    console.log('✅ [AI Settings] Successfully saved to database\n')
    revalidateAdminPath('/items')
    revalidateAdminPath('/settings')
    return { success: true, error: null }
}

export async function restoreDefaultAISettingsAction() {
    // This is handled by setting fields to NULL in saveAISettingsAction if the UI sends null
    // But we can explicitly offer it here if needed.
    // For now, saveAISettingsAction is sufficient if UI sends nulls.
    return { success: true }
}

export async function getAISettingsAction() {
    return loadAiSettings()
}

export async function getAiRuntimeSnapshotAction() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { success: false, error: 'Unauthorized', snapshot: null }
    }

    const settings = await loadAiSettings()

    const [primaryHealth, primaryModels, fallbackHealth, fallbackModels, documentHealth, recentDecisions, decisionCount, failedCount, feedbackCount] = await Promise.all([
        healthCheckAiProvider(settings.ai_provider),
        listAiModels(settings.ai_provider).catch(() => []),
        settings.ai_fallback_provider ? healthCheckAiProvider(settings.ai_fallback_provider) : Promise.resolve(null),
        settings.ai_fallback_provider ? listAiModels(settings.ai_fallback_provider).catch(() => []) : Promise.resolve([]),
        healthCheckDocumentProvider(settings.document_ai_provider).catch(() => ({
            provider: settings.document_ai_provider,
            ok: false,
            message: 'Document parser health check failed.',
            is_local: true,
        })),
        supabase
            .from('ai_decisions')
            .select('id, feature, operation, provider, model, status, started_at, completed_at, error_message')
            .order('started_at', { ascending: false })
            .limit(6),
        supabase
            .from('ai_decisions')
            .select('*', { count: 'exact', head: true }),
        supabase
            .from('ai_decisions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'failed'),
        supabase
            .from('ai_feedback')
            .select('*', { count: 'exact', head: true }),
    ])

    return {
        success: true,
        error: null,
        snapshot: {
            primaryHealth,
            primaryModels,
            fallbackHealth,
            fallbackModels,
            documentHealth,
            recentDecisions: recentDecisions.data || [],
            metrics: {
                totalDecisions: decisionCount.count || 0,
                failedDecisions: failedCount.count || 0,
                feedbackEvents: feedbackCount.count || 0,
            },
        },
    }
}
