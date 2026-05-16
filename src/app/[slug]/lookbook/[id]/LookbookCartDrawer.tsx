'use client'

import { useCallback, useState, useTransition } from 'react'
import { CalendarIcon, CheckCircle2, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useLookbookCart } from '@/store/lookbook-cart'
import { submitLookbookRequest } from '@/actions/lookbookRequest'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    organizationId: string
    lookbookId: string
}

type FormErrors = { email?: string; name?: string; dates?: string }

export function LookbookCartDrawer({ open, onOpenChange, organizationId, lookbookId }: Props) {
    const cart = useLookbookCart()
    const [submitted, setSubmitted] = useState(false)
    const [errors, setErrors] = useState<FormErrors>({})
    const [serverError, setServerError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const validate = useCallback((): FormErrors => {
        const e: FormErrors = {}
        if (!cart.contactInfo.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cart.contactInfo.email))
            e.email = 'Valid email required'
        if (!cart.contactInfo.name.trim()) e.name = 'Name required'
        if (!cart.dateRange.from || !cart.dateRange.to) e.dates = 'Select start and end dates'
        return e
    }, [cart.contactInfo, cart.dateRange])

    const handleSubmit = useCallback(() => {
        const errs = validate()
        setErrors(errs)
        if (Object.keys(errs).length > 0) return

        setServerError(null)
        startTransition(async () => {
            const result = await submitLookbookRequest({
                items: cart.items.map((i) => ({ id: i.id, name: i.name })),
                email: cart.contactInfo.email,
                fullName: cart.contactInfo.name,
                notes: cart.contactInfo.notes || undefined,
                startDate: cart.dateRange.from!,
                endDate: cart.dateRange.to!,
                organizationId,
                lookbookId,
            })

            if ('error' in result && result.error) {
                setServerError(result.error)
                return
            }
            setSubmitted(true)
        })
    }, [validate, cart, organizationId, lookbookId])

    const handleClose = useCallback(() => {
        if (submitted) {
            cart.clear()
            setSubmitted(false)
        }
        setErrors({})
        setServerError(null)
        onOpenChange(false)
    }, [submitted, cart, onOpenChange])

    return (
        <Sheet open={open} onOpenChange={handleClose}>
            <SheetContent
                side="right"
                className="flex w-full flex-col bg-white p-0 sm:max-w-md"
            >
                {submitted ? (
                    <SuccessState onClose={handleClose} itemCount={cart.items.length} />
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <h2 className="text-sm font-semibold text-slate-900">
                                Your Request
                                {cart.items.length > 0 && (
                                    <span className="ml-1 text-slate-500">
                                        ({cart.items.length} {cart.items.length === 1 ? 'item' : 'items'})
                                    </span>
                                )}
                            </h2>
                            <button
                                type="button"
                                onClick={handleClose}
                                className="rounded-md p-1 text-slate-400 hover:text-slate-600"
                                aria-label="Close"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        {/* Scrollable body */}
                        <div className="flex-1 overflow-y-auto px-4 py-4">
                            {cart.items.length === 0 ? (
                                <EmptyState />
                            ) : (
                                <div className="space-y-6">
                                    {/* Item list */}
                                    <div className="space-y-2">
                                        {cart.items.map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center gap-3 rounded-lg border border-slate-100 p-2"
                                            >
                                                <div className="size-10 shrink-0 rounded bg-slate-100" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-slate-900">
                                                        {item.name}
                                                    </p>
                                                    {item.sku && (
                                                        <p className="font-mono text-[11px] text-slate-400">
                                                            {item.sku}
                                                        </p>
                                                    )}
                                                </div>
                                                {item.rentalPrice != null && (
                                                    <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                                                        ${item.rentalPrice}
                                                    </p>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => cart.removeItem(item.id)}
                                                    className="shrink-0 rounded p-1 text-slate-300 hover:text-rose-500"
                                                    aria-label={`Remove ${item.name}`}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Dates */}
                                    <div>
                                        <Label className="text-xs font-medium text-slate-700">
                                            Rental Dates <span className="text-rose-500">*</span>
                                        </Label>
                                        <div className="mt-1.5 grid grid-cols-2 gap-2">
                                            <div className="relative">
                                                <CalendarIcon className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
                                                <Input
                                                    type="date"
                                                    value={cart.dateRange.from ?? ''}
                                                    onChange={(e) =>
                                                        cart.setDateRange({
                                                            ...cart.dateRange,
                                                            from: e.target.value || null,
                                                        })
                                                    }
                                                    className="pl-8 text-xs"
                                                    placeholder="Start"
                                                />
                                            </div>
                                            <div className="relative">
                                                <CalendarIcon className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
                                                <Input
                                                    type="date"
                                                    value={cart.dateRange.to ?? ''}
                                                    onChange={(e) =>
                                                        cart.setDateRange({
                                                            ...cart.dateRange,
                                                            to: e.target.value || null,
                                                        })
                                                    }
                                                    className="pl-8 text-xs"
                                                    placeholder="End"
                                                />
                                            </div>
                                        </div>
                                        {errors.dates && (
                                            <p className="mt-1 text-xs text-rose-500">{errors.dates}</p>
                                        )}
                                    </div>

                                    {/* Contact */}
                                    <div className="space-y-3">
                                        <div>
                                            <Label htmlFor="lb-email" className="text-xs font-medium text-slate-700">
                                                Email <span className="text-rose-500">*</span>
                                            </Label>
                                            <Input
                                                id="lb-email"
                                                type="email"
                                                value={cart.contactInfo.email}
                                                onChange={(e) =>
                                                    cart.setContactInfo({ email: e.target.value })
                                                }
                                                placeholder="you@example.com"
                                                className="mt-1 text-sm"
                                            />
                                            {errors.email && (
                                                <p className="mt-1 text-xs text-rose-500">{errors.email}</p>
                                            )}
                                        </div>
                                        <div>
                                            <Label htmlFor="lb-name" className="text-xs font-medium text-slate-700">
                                                Name <span className="text-rose-500">*</span>
                                            </Label>
                                            <Input
                                                id="lb-name"
                                                value={cart.contactInfo.name}
                                                onChange={(e) =>
                                                    cart.setContactInfo({ name: e.target.value })
                                                }
                                                placeholder="Your name"
                                                className="mt-1 text-sm"
                                            />
                                            {errors.name && (
                                                <p className="mt-1 text-xs text-rose-500">{errors.name}</p>
                                            )}
                                        </div>
                                        <div>
                                            <Label htmlFor="lb-notes" className="text-xs font-medium text-slate-700">
                                                Notes <span className="text-slate-400">(optional)</span>
                                            </Label>
                                            <Textarea
                                                id="lb-notes"
                                                rows={2}
                                                value={cart.contactInfo.notes}
                                                onChange={(e) =>
                                                    cart.setContactInfo({ notes: e.target.value })
                                                }
                                                placeholder="Any details about your rental..."
                                                className="mt-1 resize-none text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Fixed bottom */}
                        {cart.items.length > 0 && (
                            <div className="border-t px-4 py-3">
                                {serverError && (
                                    <p className="mb-2 text-xs text-rose-500">{serverError}</p>
                                )}
                                <Button
                                    onClick={handleSubmit}
                                    disabled={isPending}
                                    className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
                                >
                                    {isPending ? 'Submitting...' : 'Submit Request'}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}

function EmptyState() {
    return (
        <div className="flex h-full flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 rounded-full bg-slate-100 p-4">
                <ShoppingBag className="size-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">No items yet</p>
            <p className="mt-1 text-xs text-slate-400">
                Browse the lookbook and tap items to add them here.
            </p>
        </div>
    )
}

function ShoppingBag(props: React.ComponentProps<'svg'>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
    )
}

function SuccessState({ onClose, itemCount }: { onClose: () => void; itemCount: number }) {
    return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <CheckCircle2 className="mb-4 size-12 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900">Request Submitted</h3>
            <p className="mt-2 text-sm text-slate-500">
                We&apos;ve received your request for {itemCount}{' '}
                {itemCount === 1 ? 'item' : 'items'}. We&apos;ll review and get back to you
                within 1 business day.
            </p>
            <Button
                onClick={onClose}
                variant="outline"
                className="mt-6"
            >
                Continue Browsing
            </Button>
        </div>
    )
}
