'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Bot, Loader2, Check, AlertTriangle, XCircle, Info, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LogEntry, AIWorkflowState } from '@/hooks/useAIWorkflow'

/**
 * Props for AIStatusConsole component
 */
export interface AIStatusConsoleProps {
    /** The workflow state from useAIWorkflow hook */
    state: AIWorkflowState
    /** Whether the console is visible */
    isOpen?: boolean
    /** Optional className for custom styling */
    className?: string
    /** Title shown in the header */
    title?: string
    /** Maximum height of the console (default: 300px) */
    maxHeight?: number
}

/**
 * Tag color mappings for visual distinction (Light Theme)
 */
const TAG_COLORS: Record<string, string> = {
    Fetch: 'bg-blue-100 text-blue-700 border-blue-200',
    Gemini: 'bg-purple-100 text-purple-700 border-purple-200',
    Discovery: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Logic: 'bg-amber-100 text-amber-700 border-amber-200',
    System: 'bg-muted text-foreground border-border',
    Error: 'bg-red-100 text-red-700 border-red-200',
    Thinking: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

/**
 * Get the appropriate icon for a log entry type
 */
function LogIcon({ type }: { type: LogEntry['type'] }) {
    switch (type) {
        case 'loading':
            return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
        case 'success':
            return <Check className="h-3.5 w-3.5 text-green-500" />
        case 'warning':
            return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        case 'error':
            return <XCircle className="h-3.5 w-3.5 text-red-500" />
        case 'info':
        default:
            return <Info className="h-3.5 w-3.5 text-muted-foreground/70" />
    }
}

/**
 * Format timestamp for display (HH:MM:SS)
 */
function formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })
}

/**
 * Parsed log message with support for bold headers
 */
function LogMessage({ text }: { text: string }) {
    // Check if message starts with bold header like "**Title** Content"
    const headerMatch = text.match(/^\*\*([^*]+)\*\*([\s\S]*)/)

    if (headerMatch) {
        const [, title, content] = headerMatch
        return (
            <span className="flex flex-col gap-1 w-full">
                <span className="font-semibold block">{title}</span>
                <span className="whitespace-pre-wrap block text-muted-foreground/90 leading-relaxed">
                    {content.trim()}
                </span>
            </span>
        )
    }

    return <span className="whitespace-pre-wrap block">{text}</span>
}

/**
 * Get tag color class, with fallback for unknown tags
 */
function getTagColor(tag: string): string {
    return TAG_COLORS[tag] || TAG_COLORS.System
}

/**
 * A clean, light-themed console for displaying AI workflow logs.
 */
export function AIStatusConsole({
    state,
    isOpen = true,
    className,
    title = 'Import Progress',
    maxHeight = 300
}: AIStatusConsoleProps) {
    const [isCollapsed, setIsCollapsed] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const logMessagesKey = state.logs.map((log) => log.message).join('|')

    // Auto-scroll to bottom when new logs are added or updated
    useEffect(() => {
        if (scrollRef.current && !isCollapsed) {
            // Use requestAnimationFrame to ensure DOM is updated
            const scroll = () => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                }
            }
            requestAnimationFrame(scroll)
        }
    }, [state.logs, isCollapsed, logMessagesKey]) // Watch message changes for appending

    // Auto-collapse on success after a short delay
    useEffect(() => {
        if (state.status === 'success') {
            const timer = setTimeout(() => {
                setIsCollapsed(true)
            }, 1500)
            return () => clearTimeout(timer)
        }
    }, [state.status])

    if (!isOpen) return null

    return (
        <Card className={cn('overflow-hidden border-border shadow-sm transition-all duration-300 ease-in-out py-0 gap-0', className)}>
            {/* Header */}
            <div
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="py-3 px-4 bg-muted/40 border-b cursor-pointer hover:bg-muted/60 transition-colors flex items-center justify-between group"
            >
                <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-md transition-colors",
                        state.status === 'success' ? "bg-green-100 text-green-600" : "bg-card border shadow-sm text-muted-foreground"
                    )}>
                        {state.status === 'success' ? <Check className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div>
                        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                            {title}
                        </CardTitle>
                        {isCollapsed && state.status === 'success' && (
                            <p className="text-xs text-green-600 font-medium mt-0.5 animate-in fade-in">
                                Analysis complete
                            </p>
                        )}
                        {isCollapsed && state.status !== 'success' && state.currentItem && (
                            <p className="text-xs text-muted-foreground mt-0.5 max-w-[300px] truncate">
                                {state.currentItem}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {!isCollapsed && state.currentItem && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5 mr-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                            </span>
                            <span className="hidden sm:inline">{state.currentItem}</span>
                        </span>
                    )}
                    <ChevronDown className={cn(
                        "h-4 w-4 text-muted-foreground/70 transition-transform duration-300",
                        isCollapsed ? "" : "rotate-180"
                    )} />
                </div>
            </div>

            {/* Console Content */}
            <div
                className={cn(
                    "transition-[max-height,opacity] duration-300 ease-in-out",
                    isCollapsed ? "max-h-0 opacity-0" : "opacity-100"
                )}
                style={{ maxHeight: isCollapsed ? 0 : `${maxHeight}px` }}
            >
                <CardContent className="p-0">
                    <div
                        ref={scrollRef}
                        className="bg-card/50 font-mono text-xs overflow-y-auto custom-scrollbar"
                        style={{ maxHeight: `${maxHeight}px`, minHeight: '120px' }}
                    >
                        {state.logs.length === 0 ? (
                            <div className="flex items-center justify-center h-[120px] text-muted-foreground/70">
                                <span>Waiting for import progress...</span>
                            </div>
                        ) : (
                            <div className="p-3 space-y-2">
                                {state.logs.map((log) => (
                                    <div
                                        key={log.id}
                                        className="flex items-start gap-3 leading-relaxed animate-in fade-in slide-in-from-bottom-1 duration-200 group/log"
                                    >
                                        {/* Timestamp */}
                                        <span className="text-muted-foreground/70 font-medium shrink-0 text-[10px] pt-1 w-[42px]">
                                            {formatTimestamp(log.timestamp)}
                                        </span>

                                        {/* Status Icon */}
                                        <div className="shrink-0 pt-0.5 opacity-80">
                                            <LogIcon type={log.type} />
                                        </div>

                                        {/* Tag Badge */}
                                        <span
                                            className={cn(
                                                'px-2 py-0.5 rounded-[4px] text-[10px] font-semibold border shrink-0 min-w-[64px] text-center tracking-wide',
                                                getTagColor(log.tag)
                                            )}
                                        >
                                            {log.tag}
                                        </span>

                                        {/* Message */}
                                        <span
                                            className={cn(
                                                'text-muted-foreground text-[11px]',
                                                log.type === 'error' && 'text-red-600',
                                                log.type === 'warning' && 'text-amber-600',
                                                log.type === 'success' && 'text-foreground',
                                                log.type === 'loading' && 'text-muted-foreground'
                                            )}
                                        >
                                            <LogMessage text={log.message} />
                                        </span>
                                    </div>
                                ))}
                                {/* Computation Report */}
                                {state.usage && (
                                    <div className="mt-4 pt-3 border-t border-border text-[10px] font-mono text-muted-foreground/70 flex items-center justify-between opacity-80 hover:opacity-100 transition-opacity">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse"></div>
                                            <span>[System] Computation complete.</span>
                                        </div>
                                        <div className="flex gap-3">
                                            <span>Reasoned through <span className="text-indigo-500 font-semibold">{state.usage.thinkingTokenCount || 0}</span> tokens</span>
                                            <span className="text-muted-foreground">Total: {state.usage.totalTokenCount || 0}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Spacer for scroll */}
                                <div className="h-4" />
                            </div>
                        )}
                    </div>
                </CardContent>
            </div>
        </Card>
    )
}

export default AIStatusConsole
