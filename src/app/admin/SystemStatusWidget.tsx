'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export function SystemStatusWidget() {
    const [errorCount, setErrorCount] = useState<number>(0)
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        // Initial Fetch
        const fetchErrors = async () => {
            const { count, error } = await supabase
                .from('system_errors')
                .select('*', { count: 'exact', head: true })
                .eq('resolved', false)

            if (!error) {
                setErrorCount(count || 0)
            }
            setLoading(false)
        }

        fetchErrors()

        // Realtime Subscription
        const channel = supabase
            .channel('system-status-changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen for INSERT (new error) or UPDATE (resolved)
                    schema: 'public',
                    table: 'system_errors',
                },
                () => {
                    // Refresh count on any change
                    fetchErrors()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase])

    if (loading) return null

    return (
        <Link href="/admin/errors" className={cn(
            "fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg border transition-all duration-300 backdrop-blur-sm cursor-pointer",
            errorCount > 0
                ? "bg-red-50/90 border-red-200 text-red-700 hover:bg-red-100"
                : "bg-background/90 border-border text-muted-foreground hover:bg-muted/50"
        )}>
            {errorCount > 0 ? (
                <>
                    <div className="relative">
                        <AlertCircle className="h-4 w-4" />
                        <span className="absolute -top-1 -right-1 block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    </div>
                    <span className="text-sm font-medium">
                        {errorCount} System Issue{errorCount !== 1 ? 's' : ''}
                    </span>
                </>
            ) : (
                <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-muted-foreground">System Healthy</span>
                </>
            )}
        </Link>
    )
}
