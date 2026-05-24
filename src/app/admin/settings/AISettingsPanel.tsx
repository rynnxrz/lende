'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
    AlertCircle,
    Bot,
    CheckCircle2,
    FileSearch,
    Loader2,
    RefreshCw,
    Route,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getAiRuntimeSnapshotAction, saveAISettingsAction } from '@/app/admin/settings/actions'

type RuntimeHealth = {
    provider: string
    ok: boolean
    message: string
    capabilities: {
        supports_streaming: boolean
        supports_structured_output: boolean
        supports_inline_data: boolean
        supports_google_search: boolean
        supports_thinking: boolean
        is_local: boolean
    }
}

type RuntimeModel = {
    id: string
    displayName: string
}

type RuntimeDecision = {
    id: string
    feature: string
    operation: string
    provider: string | null
    model: string | null
    status: string
    started_at: string
    completed_at: string | null
    error_message: string | null
}

type RuntimeSnapshot = {
    primaryHealth: RuntimeHealth
    primaryModels: RuntimeModel[]
    fallbackHealth: RuntimeHealth | null
    fallbackModels: RuntimeModel[]
    documentHealth: {
        provider: string
        ok: boolean
        message: string
        is_local: boolean
    }
    recentDecisions: RuntimeDecision[]
    metrics: {
        totalDecisions: number
        failedDecisions: number
        feedbackEvents: number
    }
}

type AISettingsState = {
    ai_provider: string
    ai_primary_model: string
    ai_primary_base_url: string | null
    ai_allow_fallback: boolean
    ai_fallback_provider: string | null
    ai_fallback_model: string | null
    ai_fallback_base_url: string | null
    ai_selected_model: string
    document_ai_provider: string
    document_ai_model: string | null
    document_ai_base_url: string | null
    ai_prompt_category: string | null
    ai_prompt_subcategory: string | null
    ai_prompt_product_list: string | null
    ai_prompt_quick_list: string | null
    ai_prompt_product_detail: string | null
    ai_thinking_category: string | null
    ai_thinking_subcategory: string | null
    ai_thinking_product_list: string | null
    ai_thinking_product_detail: string | null
    ai_max_output_tokens: number | null
    ai_use_system_instruction: boolean
}

interface AISettingsPanelProps {
    initialSettings: AISettingsState
    initialRuntime: RuntimeSnapshot | null
}

const LLM_PROVIDER_OPTIONS = [
    { value: 'ollama', label: 'Ollama (Local)' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'dashscope', label: 'DashScope / Qwen API' },
]

const DOCUMENT_PROVIDER_OPTIONS = [
    { value: 'pdfjs', label: 'PDF.js Parser' },
    { value: 'glm-ocr', label: 'GLM-OCR' },
]

const capabilityBadges = (health: RuntimeHealth | null) => {
    if (!health) return []
    const capabilities = health.capabilities
    return [
        capabilities.is_local ? 'Local runtime' : 'Remote runtime',
        capabilities.supports_google_search ? 'Google Search tool' : 'No web tool',
        capabilities.supports_thinking ? 'Thinking config' : 'No thinking config',
        capabilities.supports_inline_data ? 'Inline images/files' : 'Text only',
        capabilities.supports_streaming ? 'Streaming' : 'No streaming',
    ]
}

export default function AISettingsPanel({
    initialSettings,
    initialRuntime,
}: AISettingsPanelProps) {
    const [settings, setSettings] = useState<AISettingsState>(initialSettings)
    const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(initialRuntime)
    const [isPending, startTransition] = useTransition()

    const primaryModels = useMemo(() => runtime?.primaryModels || [], [runtime])
    const fallbackModels = useMemo(() => runtime?.fallbackModels || [], [runtime])

    const handleRefreshRuntime = () => {
        startTransition(async () => {
            const result = await getAiRuntimeSnapshotAction()
            if (!result.success) {
                toast.error(result.error || 'Could not refresh AI runtime status.')
                return
            }

            setRuntime(result.snapshot)
            toast.success('AI runtime status refreshed.')
        })
    }

    const handleSave = () => {
        startTransition(async () => {
            const payload = {
                ...settings,
                ai_selected_model: settings.ai_primary_model,
                ai_primary_base_url: settings.ai_primary_base_url?.trim() || null,
                ai_fallback_provider: settings.ai_allow_fallback
                    ? settings.ai_fallback_provider || null
                    : null,
                ai_fallback_model: settings.ai_allow_fallback
                    ? settings.ai_fallback_model?.trim() || null
                    : null,
                ai_fallback_base_url: settings.ai_allow_fallback
                    ? settings.ai_fallback_base_url?.trim() || null
                    : null,
                document_ai_model: settings.document_ai_model?.trim() || null,
                document_ai_base_url: settings.document_ai_base_url?.trim() || null,
                ai_prompt_category: settings.ai_prompt_category?.trim() || null,
                ai_prompt_subcategory: settings.ai_prompt_subcategory?.trim() || null,
                ai_prompt_product_list: settings.ai_prompt_product_list?.trim() || null,
                ai_prompt_quick_list: settings.ai_prompt_quick_list?.trim() || null,
                ai_prompt_product_detail: settings.ai_prompt_product_detail?.trim() || null,
                ai_thinking_category: settings.ai_thinking_category?.trim() || null,
                ai_thinking_subcategory: settings.ai_thinking_subcategory?.trim() || null,
                ai_thinking_product_list: settings.ai_thinking_product_list?.trim() || null,
                ai_thinking_product_detail: settings.ai_thinking_product_detail?.trim() || null,
                ai_max_output_tokens: settings.ai_max_output_tokens || null,
            }

            const result = await saveAISettingsAction(payload)
            if (!result.success) {
                toast.error(result.error || 'Could not save AI settings.')
                return
            }

            toast.success('AI settings saved.')
            const runtimeResult = await getAiRuntimeSnapshotAction()
            if (runtimeResult.success) {
                setRuntime(runtimeResult.snapshot)
            }
        })
    }

    return (
        <div className="space-y-6">
            <Card className="border-border">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Bot className="h-5 w-5 text-muted-foreground" />
                            AI Runtime
                        </CardTitle>
                        <CardDescription>
                            LLM routing status, document parser status, and recent decision traces.
                        </CardDescription>
                    </div>
                    <Button variant="outline" onClick={handleRefreshRuntime} disabled={isPending}>
                        {isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Refresh Status
                    </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-3">
                        <RuntimeHealthCard
                            title="Primary LLM"
                            health={runtime?.primaryHealth || null}
                            badges={capabilityBadges(runtime?.primaryHealth || null)}
                        />
                        <RuntimeHealthCard
                            title="Fallback LLM"
                            health={runtime?.fallbackHealth || null}
                            badges={capabilityBadges(runtime?.fallbackHealth || null)}
                        />
                        <DocumentHealthCard health={runtime?.documentHealth || null} />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <MetricCard label="Decisions" value={runtime?.metrics.totalDecisions || 0} />
                        <MetricCard label="Failures" value={runtime?.metrics.failedDecisions || 0} />
                        <MetricCard label="Feedback Events" value={runtime?.metrics.feedbackEvents || 0} />
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/50 p-4">
                        <div className="text-sm font-semibold text-foreground">Recent Decisions</div>
                        <div className="mt-3 space-y-2">
                            {(runtime?.recentDecisions || []).length === 0 && (
                                <div className="text-sm text-muted-foreground">No AI decision records yet.</div>
                            )}
                            {(runtime?.recentDecisions || []).map(decision => (
                                <div
                                    key={decision.id}
                                    className="rounded-xl border border-border bg-card px-3 py-3 text-sm"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="font-medium text-foreground">
                                            {decision.feature} / {decision.operation}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {decision.provider || 'provider?'} · {decision.model || 'model?'} · {decision.status}
                                        </div>
                                    </div>
                                    {decision.error_message && (
                                        <div className="mt-2 text-rose-600">{decision.error_message}</div>
                                    )}
                                    <div className="mt-2 text-xs text-muted-foreground">
                                        Started {new Date(decision.started_at).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Route className="h-5 w-5 text-muted-foreground" />
                        LLM Routing
                    </CardTitle>
                    <CardDescription>
                        Keep local Ollama as the default route, with optional manual fallback to hosted providers.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <LabeledSelect
                            label="Primary Provider"
                            value={settings.ai_provider}
                            onChange={value => setSettings(prev => ({ ...prev, ai_provider: value }))}
                            options={LLM_PROVIDER_OPTIONS}
                        />
                        <LabeledInput
                            label="Primary Model"
                            value={settings.ai_primary_model}
                            onChange={value => setSettings(prev => ({
                                ...prev,
                                ai_primary_model: value,
                                ai_selected_model: value,
                            }))}
                            listId="primary-models"
                        />
                    </div>
                    <datalist id="primary-models">
                        {primaryModels.map(model => (
                            <option key={model.id} value={model.id}>
                                {model.displayName}
                            </option>
                        ))}
                    </datalist>

                    <LabeledInput
                        label="Primary Base URL"
                        value={settings.ai_primary_base_url || ''}
                        onChange={value => setSettings(prev => ({ ...prev, ai_primary_base_url: value }))}
                        placeholder="http://127.0.0.1:11434"
                    />

                    <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
                        <input
                            type="checkbox"
                            checked={settings.ai_allow_fallback}
                            onChange={event => setSettings(prev => ({
                                ...prev,
                                ai_allow_fallback: event.target.checked,
                            }))}
                        />
                        Allow configured fallback provider
                    </label>

                    {settings.ai_allow_fallback && (
                        <div className="grid gap-4 rounded-2xl border border-border p-4 md:grid-cols-3">
                            <LabeledSelect
                                label="Fallback Provider"
                                value={settings.ai_fallback_provider || ''}
                                onChange={value => setSettings(prev => ({
                                    ...prev,
                                    ai_fallback_provider: value || null,
                                }))}
                                options={[{ value: '', label: 'None' }, ...LLM_PROVIDER_OPTIONS]}
                            />
                            <LabeledInput
                                label="Fallback Model"
                                value={settings.ai_fallback_model || ''}
                                onChange={value => setSettings(prev => ({ ...prev, ai_fallback_model: value }))}
                                listId="fallback-models"
                            />
                            <LabeledInput
                                label="Fallback Base URL"
                                value={settings.ai_fallback_base_url || ''}
                                onChange={value => setSettings(prev => ({ ...prev, ai_fallback_base_url: value }))}
                                placeholder="Optional override"
                            />
                            <datalist id="fallback-models">
                                {fallbackModels.map(model => (
                                    <option key={model.id} value={model.id}>
                                        {model.displayName}
                                    </option>
                                ))}
                            </datalist>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="border-border">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileSearch className="h-5 w-5 text-muted-foreground" />
                        Document Parsing / OCR
                    </CardTitle>
                    <CardDescription>
                        Choose whether lookbook parsing uses the built-in PDF.js parser or an external GLM-OCR service.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                        <LabeledSelect
                            label="Document Provider"
                            value={settings.document_ai_provider}
                            onChange={value => setSettings(prev => ({ ...prev, document_ai_provider: value }))}
                            options={DOCUMENT_PROVIDER_OPTIONS}
                        />
                        <LabeledInput
                            label="OCR Model"
                            value={settings.document_ai_model || ''}
                            onChange={value => setSettings(prev => ({ ...prev, document_ai_model: value }))}
                            placeholder="glm-ocr"
                        />
                        <LabeledInput
                            label="OCR Base URL"
                            value={settings.document_ai_base_url || ''}
                            onChange={value => setSettings(prev => ({ ...prev, document_ai_base_url: value }))}
                            placeholder="http://127.0.0.1:5002"
                        />
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                        `pdfjs` keeps local parsing dependency-free. `glm-ocr` enables richer OCR/layout parsing through the configured endpoint and is never selected as a silent fallback.
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border">
                <CardHeader>
                    <CardTitle>Prompt & Thinking Controls</CardTitle>
                    <CardDescription>
                        These prompts remain compatible with the old workflow, but now run through the shared gateway and decision trace layer.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <LabeledInput
                            label="Max Output Tokens"
                            value={settings.ai_max_output_tokens ? String(settings.ai_max_output_tokens) : ''}
                            onChange={value => setSettings(prev => ({
                                ...prev,
                                ai_max_output_tokens: value ? Number.parseInt(value, 10) || null : null,
                            }))}
                            placeholder="Leave empty for model default"
                        />
                        <label className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
                            <input
                                type="checkbox"
                                checked={settings.ai_use_system_instruction}
                                onChange={event => setSettings(prev => ({
                                    ...prev,
                                    ai_use_system_instruction: event.target.checked,
                                }))}
                            />
                            Enable shared system instruction
                        </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <LabeledInput
                            label="Thinking: Category"
                            value={settings.ai_thinking_category || ''}
                            onChange={value => setSettings(prev => ({ ...prev, ai_thinking_category: value }))}
                            placeholder="low / medium / high or token budget"
                        />
                        <LabeledInput
                            label="Thinking: Subcategory"
                            value={settings.ai_thinking_subcategory || ''}
                            onChange={value => setSettings(prev => ({ ...prev, ai_thinking_subcategory: value }))}
                            placeholder="low / medium / high or token budget"
                        />
                        <LabeledInput
                            label="Thinking: Product List"
                            value={settings.ai_thinking_product_list || ''}
                            onChange={value => setSettings(prev => ({ ...prev, ai_thinking_product_list: value }))}
                            placeholder="low / medium / high or token budget"
                        />
                        <LabeledInput
                            label="Thinking: Product Detail"
                            value={settings.ai_thinking_product_detail || ''}
                            onChange={value => setSettings(prev => ({ ...prev, ai_thinking_product_detail: value }))}
                            placeholder="low / medium / high or token budget"
                        />
                    </div>

                    <div className="grid gap-4">
                        <LabeledTextarea
                            label="Category Prompt"
                            value={settings.ai_prompt_category || ''}
                            onChange={value => setSettings(prev => ({ ...prev, ai_prompt_category: value }))}
                        />
                        <LabeledTextarea
                            label="Subcategory Prompt"
                            value={settings.ai_prompt_subcategory || ''}
                            onChange={value => setSettings(prev => ({ ...prev, ai_prompt_subcategory: value }))}
                        />
                        <LabeledTextarea
                            label="Quick List Prompt"
                            value={settings.ai_prompt_quick_list || ''}
                            onChange={value => setSettings(prev => ({ ...prev, ai_prompt_quick_list: value }))}
                        />
                        <LabeledTextarea
                            label="Product List Prompt"
                            value={settings.ai_prompt_product_list || ''}
                            onChange={value => setSettings(prev => ({ ...prev, ai_prompt_product_list: value }))}
                        />
                        <LabeledTextarea
                            label="Product Detail Prompt"
                            value={settings.ai_prompt_product_detail || ''}
                            onChange={value => setSettings(prev => ({ ...prev, ai_prompt_product_detail: value }))}
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save AI Settings
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function RuntimeHealthCard({
    title,
    health,
    badges,
}: {
    title: string
    health: RuntimeHealth | null
    badges: string[]
}) {
    const healthy = health?.ok
    return (
        <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {healthy ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                )}
                {title}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
                {health ? health.message : 'Not configured'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {badges.map(badge => (
                    <span
                        key={badge}
                        className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                        {badge}
                    </span>
                ))}
            </div>
        </div>
    )
}

function DocumentHealthCard({
    health,
}: {
    health: RuntimeSnapshot['documentHealth'] | null
}) {
    const healthy = health?.ok
    return (
        <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {healthy ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                )}
                Document Parser
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
                {health ? `${health.provider}: ${health.message}` : 'Not configured'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                    {health?.is_local ? 'Local runtime' : 'Remote runtime'}
                </span>
            </div>
        </div>
    )
}

function MetricCard({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
        </div>
    )
}

function LabeledInput({
    label,
    value,
    onChange,
    placeholder,
    listId,
}: {
    label: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    listId?: string
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <Input
                value={value}
                onChange={event => onChange(event.target.value)}
                placeholder={placeholder}
                list={listId}
            />
        </div>
    )
}

function LabeledSelect({
    label,
    value,
    onChange,
    options,
}: {
    label: string
    value: string
    onChange: (value: string) => void
    options: Array<{ value: string; label: string }>
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <select
                value={value}
                onChange={event => onChange(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
                {options.map(option => (
                    <option key={option.value || 'empty'} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    )
}

function LabeledTextarea({
    label,
    value,
    onChange,
}: {
    label: string
    value: string
    onChange: (value: string) => void
}) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            <Textarea value={value} onChange={event => onChange(event.target.value)} className="min-h-28" />
        </div>
    )
}
