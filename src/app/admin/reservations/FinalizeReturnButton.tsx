'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { finalizeReturn } from '../actions'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface FinalizeReturnButtonProps {
    reservationId: string
    label?: string
    compact?: boolean
}

export function FinalizeReturnButton({
    reservationId,
    label,
    compact = false,
}: FinalizeReturnButtonProps) {
    const [isPending, startTransition] = useTransition()
    const router = useRouter()
    const buttonLabel = label || (compact ? 'Confirm Return' : 'Complete Return & Close Order')

    const handleFinalize = () => {
        startTransition(() => {
            void (async () => {
                const result = await finalizeReturn(reservationId)

                if (result?.error) {
                    toast.error(result.error)
                } else {
                    toast.success('Reservation moved to Past-loan')
                    router.refresh()
                }
            })()
        })
    }

    return (
        <Button
            type="button"
            onClick={handleFinalize}
            disabled={isPending}
            size={compact ? 'sm' : 'default'}
            className={compact ? undefined : 'bg-primary text-white px-6 py-3 rounded-lg font-medium hover:bg-primary shadow-sm transition-all'}
        >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending ? 'Completing...' : buttonLabel}
        </Button>
    )
}
