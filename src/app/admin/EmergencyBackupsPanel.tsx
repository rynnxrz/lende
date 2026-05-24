'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { convertEmergencyBackup } from './emergency/actions'

type EmergencyBackup = {
    id: string
    fingerprint: string
    created_at: string
    payload: {
        // Flat format (from bulkRequest action)
        items?: string[]
        items_detail?: { id: string; name: string }[]
        full_name?: string
        email?: string
        start_date?: string
        end_date?: string
        // Nested format (from SummaryClient getSubmissionData)
        customer?: {
            full_name?: string
            email?: string
        }
        dates?: {
            from?: string
            to?: string
        }
    }
}

export function EmergencyBackupsPanel({ backups }: { backups: EmergencyBackup[] }) {
    const [items, setItems] = useState(backups)
    const [pendingId, setPendingId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const handleConvert = (backupId: string) => {
        setPendingId(backupId)
        startTransition(() => {
            void (async () => {
                const result = await convertEmergencyBackup(backupId)
                if (result.success) {
                    toast.success('Backup converted into reservation')
                    setItems((prev) => prev.filter((item) => item.id !== backupId))
                } else {
                    toast.error(result.error || 'Failed to convert backup')
                }
                setPendingId(null)
            })()
        })
    }

    if (items.length === 0) {
        return (
            <div className="text-sm text-muted-foreground">
                No emergency backups waiting.
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {items.map((backup) => {
                const payload = backup.payload || {}

                // Handle both flat and nested payload structures
                const customerName = payload.full_name || payload.customer?.full_name || 'Unknown Customer'
                const customerEmail = payload.email || payload.customer?.email || 'No email'
                const startDate = payload.start_date || payload.dates?.from
                const endDate = payload.end_date || payload.dates?.to

                // Get item names from items_detail array (nested format uses objects with id/name)
                const itemDetails = payload.items_detail || (payload as { items?: { id: string; name: string }[] }).items
                const itemNames = Array.isArray(itemDetails)
                    ? itemDetails.map((item: { id?: string; name?: string } | string) =>
                        typeof item === 'object' ? item.name : item
                    ).filter(Boolean)
                    : []
                const fallbackCount = payload.items?.length || itemNames.length || 0
                const itemLabel = itemNames.length > 0 ? itemNames.join(', ') : `${fallbackCount} item(s)`
                const dateLabel = startDate && endDate
                    ? `${startDate} → ${endDate}`
                    : 'Dates missing'

                return (
                    <div
                        key={backup.id}
                        className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4"
                    >
                        <div className="flex flex-col gap-1">
                            <div className="text-sm font-medium text-amber-900">
                                {customerName} ({customerEmail})
                            </div>
                            <div className="text-xs text-amber-700">
                                {itemLabel}
                            </div>
                            <div className="text-xs text-amber-700">
                                {dateLabel}
                            </div>
                            <div className="text-[11px] text-amber-600">
                                {format(new Date(backup.created_at), 'MMM dd, yyyy HH:mm')}
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button
                                size="sm"
                                onClick={() => handleConvert(backup.id)}
                                disabled={isPending && pendingId === backup.id}
                            >
                                {isPending && pendingId === backup.id ? 'Converting...' : 'Convert to Reservation'}
                            </Button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
