'use client'

import { useState, useTransition } from 'react'
import { Loader2, FileText } from 'lucide-react'
import { markAsShipped } from '@/app/admin/actions'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { downloadInvoicePdf } from '@/actions/invoice'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function DispatchButton({ reservationId, invoiceId }: { reservationId: string, invoiceId?: string }) {
    const [showConfirm, setShowConfirm] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [isReviewing, setIsReviewing] = useState(false)
    const [attachInvoice, setAttachInvoice] = useState(true)
    const router = useRouter()

    const handleReviewInvoice = async () => {
        if (!invoiceId) {
            toast.error('No invoice found for this reservation')
            return
        }

        setIsReviewing(true)
        try {
            const result = await downloadInvoicePdf(invoiceId)
            if (result.success && result.data) {
                // Open PDF in new tab
                const byteCharacters = atob(result.data)
                const byteNumbers = new Array(byteCharacters.length)
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i)
                }
                const byteArray = new Uint8Array(byteNumbers)
                const blob = new Blob([byteArray], { type: 'application/pdf' })
                const url = URL.createObjectURL(blob)
                window.open(url, '_blank')
            } else {
                toast.error(result.error || 'Failed to generate invoice PDF')
            }
        } catch (e) {
            console.error(e)
            toast.error('Error opening invoice')
        } finally {
            setIsReviewing(false)
        }
    }

    const handleDispatch = () => {
        startTransition(() => {
            void (async () => {
                const result = await markAsShipped(reservationId, attachInvoice)

                if (result.success) {
                    toast.success('Reservation marked as dispatched')
                    if (result.warning) {
                        toast.warning(result.warning)
                    }
                    router.refresh()
                } else {
                    toast.error(result.error || 'Failed to dispatch order')
                }
                setShowConfirm(false)
            })()
        })
    }

    return (
        <>
            <Button
                onClick={() => setShowConfirm(true)}
                disabled={isPending}
                size="sm"
                variant="default"
                title="Review Dispatch & Notify"
            >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? 'Sending...' : 'Review Dispatch & Notify'}
            </Button>

            <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Review Dispatch & Notify?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Review invoice options, then mark the order as dispatched and send a shipping notification email.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="py-4 space-y-4">
                        {invoiceId && (
                            <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg border border-border">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium text-foreground">Invoice Review</span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleReviewInvoice}
                                    disabled={isReviewing}
                                >
                                    {isReviewing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                    View PDF
                                </Button>
                            </div>
                        )}

                        <div className="flex items-center space-x-2">
                            {/* Fallback to simple checkbox if generic one fails, but I'll trust standard input or component if found later. 
                                For now, I will use a simple input type checkbox to avoid import issues if component doesn't match exactly.
                             */}
                            <input
                                type="checkbox"
                                id="attachInvoice"
                                checked={attachInvoice}
                                onChange={(e) => setAttachInvoice(e.target.checked)}
                                className="h-4 w-4 rounded border-input text-blue-600 focus:ring-blue-600"
                            />
                            <label
                                htmlFor="attachInvoice"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                Attach Invoice PDF to Email
                            </label>
                        </div>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault()
                                handleDispatch()
                            }}
                            disabled={isPending}
                        >
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isPending ? 'Sending...' : 'Review Dispatch & Notify'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
