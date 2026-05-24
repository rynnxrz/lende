'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { approveReservation } from '../actions'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Loader2, FileText, RotateCcw, Star, Trash2, Undo2 } from 'lucide-react'
import type { BillingProfile } from '@/types'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
    buildRentalTierDescription,
    computeInvoicePricing,
    computeRentalChargeFromRetail,
    isMonthlyRateBridgeDays,
} from '@/lib/invoice/pricing'

interface ApproveItem {
    reservationId: string
    name: string
    retailPrice: number
    days: number
    imageUrl?: string
}

interface ApproveButtonProps {
    reservationId: string
    startDate: string
    endDate: string
    itemName?: string
    rentalPrice?: number
    days?: number
    customerName?: string
    customerEmail?: string
    customerCompany?: string
    customerAddress?: string[]
    eventLocation?: string | null
    billingProfiles: BillingProfile[]
    itemImageUrl?: string
    items?: ApproveItem[]
    originalStartDate?: string
    originalEndDate?: string
    basePath?: string
}

const DISCOUNT_OPTIONS = [
    { value: '0', label: '0% (No discount)' },
    { value: '10', label: '10%' },
    { value: '15', label: '15%' },
    { value: '20', label: '20%' },
    { value: '25', label: '25%' },
    { value: '30', label: '30%' },
] as const

function getInclusiveRentalDays(startDate: string, endDate: string) {
    const start = new Date(startDate)
    const end = new Date(endDate)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        return null
    }

    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

function formatConfirmedDate(value: string) {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value

    return parsed.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

export function ApproveButton({
    reservationId,
    startDate,
    endDate,
    itemName = 'Unknown Item',
    rentalPrice = 0,
    days = 0,
    customerName = 'Guest',
    customerEmail = 'N/A',
    customerCompany,
    customerAddress,
    eventLocation,
    billingProfiles,
    itemImageUrl,
    items,
    originalStartDate,
    originalEndDate,
    basePath = '/admin',
}: ApproveButtonProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [notes, setNotes] = useState('')
    const [discountPercentageInput, setDiscountPercentageInput] = useState('0')
    const [depositAmountOverrideInput, setDepositAmountOverrideInput] = useState('')
    const [confirmedStartDateInput, setConfirmedStartDateInput] = useState(startDate)
    const [confirmedEndDateInput, setConfirmedEndDateInput] = useState(endDate)

    const initialInvoiceItems: ApproveItem[] = items && items.length > 0 ? items : [{
        reservationId,
        name: itemName,
        retailPrice: rentalPrice,
        days,
        imageUrl: itemImageUrl,
    }]
    const [keptItems, setKeptItems] = useState<ApproveItem[]>(initialInvoiceItems)
    const [removedItems, setRemovedItems] = useState<ApproveItem[]>([])
    const requestedStartDate = originalStartDate || startDate
    const requestedEndDate = originalEndDate || endDate
    const requestedDateSummary = `${formatConfirmedDate(requestedStartDate)} - ${formatConfirmedDate(requestedEndDate)}`
    const hasSelectedItems = keptItems.length > 0
    const itemOrder = new Map(initialInvoiceItems.map((item, index) => [item.reservationId, index]))
    const sortByOriginalOrder = (itemsToSort: ApproveItem[]) => {
        return [...itemsToSort].sort((left, right) => {
            return (itemOrder.get(left.reservationId) ?? 0) - (itemOrder.get(right.reservationId) ?? 0)
        })
    }

    // Find the default profile or use the first one
    const defaultProfile = billingProfiles.find(p => p.is_default) || billingProfiles[0]
    const [selectedProfileId, setSelectedProfileId] = useState<string>(defaultProfile?.id || '')

    // Get the currently selected profile for preview
    const selectedProfile = billingProfiles.find(p => p.id === selectedProfileId)
    const initialRentalDays = getInclusiveRentalDays(startDate, endDate) ?? days
    const previewRentalDays = getInclusiveRentalDays(confirmedStartDateInput, confirmedEndDateInput)
    const hasValidDateRange = previewRentalDays !== null
    const effectiveRentalDays = previewRentalDays ?? initialRentalDays

    const previewItems = keptItems.map((item) => {
        const lineTotal = computeRentalChargeFromRetail({
            retailPrice: item.retailPrice,
            rentalDays: effectiveRentalDays,
        })
        return {
            ...item,
            lineTotal,
            tierDescription: buildRentalTierDescription({
                retailPrice: item.retailPrice,
                rentalDays: effectiveRentalDays,
            }),
        }
    })

    const subtotalAmount = previewItems.reduce((sum, item) => sum + item.lineTotal, 0)
    const replacementCostTotal = previewItems.reduce((sum, item) => sum + item.retailPrice, 0)
    const parsedDiscountPercentage = Number.parseFloat(discountPercentageInput)
    const normalizedDiscountPercentage = Number.isFinite(parsedDiscountPercentage)
        ? parsedDiscountPercentage
        : 0
    const parsedDepositOverride = depositAmountOverrideInput.trim() === ''
        ? null
        : Number.parseFloat(depositAmountOverrideInput)
    const normalizedDepositOverride = typeof parsedDepositOverride === 'number' && Number.isFinite(parsedDepositOverride)
        ? parsedDepositOverride
        : null
    const pricing = computeInvoicePricing({
        subtotal: subtotalAmount,
        discountPercentage: normalizedDiscountPercentage,
        depositAmountOverride: normalizedDepositOverride,
        replacementCostTotal,
    })
    const hasManualDeposit = normalizedDepositOverride !== null
    const usesMonthlyBridgeRate = isMonthlyRateBridgeDays(effectiveRentalDays)
    const lateFeeNotice = 'Late return fee: £20 per day, which will be deducted from the deposit.'
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const invoiceIdDisplay = `INV-R-${dateStr}-####`
    const usesRequestedDates =
        confirmedStartDateInput === requestedStartDate && confirmedEndDateInput === requestedEndDate

    const resetReviewSelections = () => {
        setKeptItems(initialInvoiceItems)
        setRemovedItems([])
        setConfirmedStartDateInput(startDate)
        setConfirmedEndDateInput(endDate)
    }

    const handleRemoveItem = (reservationItemId: string) => {
        const itemToRemove = keptItems.find((item) => item.reservationId === reservationItemId)
        if (!itemToRemove) return

        setKeptItems((current) => current.filter((item) => item.reservationId !== reservationItemId))
        setRemovedItems((current) => sortByOriginalOrder([...current, itemToRemove]))
    }

    const handleRestoreItem = (reservationItemId: string) => {
        const itemToRestore = removedItems.find((item) => item.reservationId === reservationItemId)
        if (!itemToRestore) return

        setRemovedItems((current) => current.filter((item) => item.reservationId !== reservationItemId))
        setKeptItems((current) => sortByOriginalOrder([...current, itemToRestore]))
    }

    const handleApprove = async () => {
        if (!selectedProfileId) {
            toast.error('Please select a billing profile')
            return
        }
        if (!hasValidDateRange) {
            toast.error('Confirmed return date must be on or after the call-in date.')
            return
        }
        if (!hasSelectedItems) {
            toast.error('Keep at least one item in the invoice before sending it.')
            return
        }

        startTransition(() => {
            void (async () => {
                const result = await approveReservation(reservationId, selectedProfileId, {
                    notes: notes || undefined,
                    discountPercentage: normalizedDiscountPercentage,
                    depositAmountOverride: normalizedDepositOverride,
                    confirmedStartDate: confirmedStartDateInput,
                    confirmedEndDate: confirmedEndDateInput,
                    includedReservationIds: keptItems.map((item) => item.reservationId),
                })

                if (result.error) {
                    if (result.error.includes('23P01') || result.error.includes('conflicting key')) {
                        toast.error('Date Conflict', {
                            description: 'This item is already booked for the selected dates.'
                        })
                    } else {
                        // Handle specific warning for email failure
                        if (result.error === 'DATABASE_UPDATED_BUT_EMAIL_FAILED') {
                            toast.warning('Approved, but email failed.', {
                                description: 'The invoice was saved but could not be emailed. Please check System Errors.'
                            })
                            setOpen(false)
                            setNotes('')
                            resetReviewSelections()
                            router.refresh()
                            return
                        }

                        toast.error(result.error)
                    }
                } else {
                    toast.success('Reservation Approved', {
                        description: 'Invoice sent to customer.'
                    })
                    setOpen(false)
                    setNotes('')
                    resetReviewSelections()
                    router.refresh()
                }
            })()
        })
    }

    // Fallback bank info for display if no profile selected
    const bankInfo = selectedProfile?.bank_info || "No billing profile selected"
    const companyHeader = selectedProfile?.company_header || "No billing profile selected"
    const contactEmail = selectedProfile?.contact_email || ""
    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen)

        if (!nextOpen) {
            resetReviewSelections()
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button size="sm" variant="default">
                    Review & Invoice
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Review Invoice Preview
                        </div>
                        <a
                            href={`${basePath}/settings`}
                            target="_blank"
                            className="text-xs text-blue-600 hover:text-blue-800 underline font-normal"
                        >
                            Edit Settings
                        </a>
                    </DialogTitle>
                    <DialogDescription>
                        This is exactly what the customer will see.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* BILLING PROFILE SELECTOR */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
                        <Label className="text-sm font-medium text-foreground mb-2 block">
                            Select Billing Profile
                        </Label>
                        {billingProfiles.length === 0 ? (
                            <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded border border-amber-200">
                                No billing profiles found. <a href={`${basePath}/settings`} target="_blank" className="underline">Create one in Settings</a> first.
                            </div>
                        ) : (
                            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                                <SelectTrigger className="w-full bg-card">
                                    <SelectValue placeholder="Select a billing profile" />
                                </SelectTrigger>
                                <SelectContent>
                                    {billingProfiles.map((profile) => (
                                        <SelectItem key={profile.id} value={profile.id}>
                                            <div className="flex items-center gap-2">
                                                {profile.is_default && <Star className="h-3 w-3 text-blue-500" />}
                                                <span>{profile.profile_name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                            Switch profiles to see different payment info in the preview below.
                        </p>
                    </div>

                    {/* INVOICE PREVIEW CONTAINER */}
                    <div className="bg-card border border-border shadow-sm p-8 text-sm text-foreground font-sans">

                        {/* Header Section */}
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-foreground mb-2">INVOICE</h1>
                                <div className="text-muted-foreground space-y-0.5">
                                    <p className="font-medium text-foreground whitespace-pre-wrap">{companyHeader}</p>
                                    <p>{contactEmail}</p>
                                </div>
                            </div>
                            <div className="text-right text-muted-foreground">
                                <p>Invoice #: {invoiceIdDisplay}</p>
                                <p>Date: {today}</p>
                            </div>
                        </div>

                        {/* Bill To */}
                        <div className="mb-8 border-b border-border pb-4">
                            <h3 className="font-bold text-foreground mb-2 uppercase text-xs tracking-wider">Bill To</h3>
                            <p className="font-medium">{customerName}</p>
                            {customerCompany && <p className="text-indigo-600 text-xs">{customerCompany}</p>}
                            {customerAddress && customerAddress.map((line, i) => (
                                <p key={i} className="text-muted-foreground">{line}</p>
                            ))}
                            <p className="text-muted-foreground">{customerEmail}</p>
                        </div>

                        <div className="mb-8 rounded border border-border bg-muted/50 p-4">
                            <h3 className="font-bold text-foreground mb-2 uppercase text-xs tracking-wider">
                                Confirmed Loan Details
                            </h3>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Call-in / Start Date</p>
                                    <p className="font-medium text-foreground">{formatConfirmedDate(confirmedStartDateInput)}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Return Date</p>
                                    <p className="font-medium text-foreground">{formatConfirmedDate(confirmedEndDateInput)}</p>
                                </div>
                                <div className="sm:col-span-2">
                                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Shoot / Event Location</p>
                                    <p className="font-medium text-foreground">{eventLocation || 'Not provided'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Line Items */}
                        <div className="mb-8">
                            <h3 className="font-bold text-foreground mb-2 uppercase text-xs tracking-wider border-b border-border pb-1">Reservation Details</h3>

                            {previewItems.length === 0 ? (
                                <div className="rounded border border-dashed border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-800">
                                    No available items selected for this invoice yet.
                                </div>
                            ) : (
                                previewItems.map((item, idx) => (
                                    <div key={idx} className="flex gap-3 py-2 border-b border-border">
                                        {item.imageUrl ? (
                                            <Image
                                                src={item.imageUrl}
                                                alt={item.name}
                                                width={48}
                                                height={48}
                                                className="w-12 h-12 object-cover rounded border border-border"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 bg-muted rounded border border-border flex items-center justify-center text-muted-foreground/70 text-xs">
                                                No img
                                            </div>
                                        )}
                                        <div className="flex-1 flex justify-between">
                                            <div>
                                                <span className="font-medium text-foreground">{item.name}</span>
                                                <div className="text-xs text-muted-foreground">{item.tierDescription}</div>
                                            </div>
                                            <div className="text-right">
                                                <span>£{item.lineTotal.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            {usesMonthlyBridgeRate && previewItems.length > 0 && (
                                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                    1-Month Rate applied (charged at monthly rate) for 15-29 day rentals.
                                </div>
                            )}
                        </div>

                        {/* Charges */}
                        <div className="mb-8">
                            <h3 className="font-bold text-foreground mb-2 uppercase text-xs tracking-wider border-b border-border pb-1">Charges</h3>
                            <div className="flex justify-between py-2 border-b border-border">
                                <span className="text-muted-foreground">Subtotal</span>
                                <span className="font-medium">£{pricing.subtotal.toFixed(2)}</span>
                            </div>
                            {pricing.discountAmount > 0 && (
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Discount ({pricing.discountPercentage.toFixed(2)}%)</span>
                                    <span className="font-medium text-red-600">- £{pricing.discountAmount.toFixed(2)}</span>
                                </div>
                            )}
                            {!hasManualDeposit && (
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Deposit (50% Retail)</span>
                                    <span className="font-medium">£{pricing.defaultDepositAmount.toFixed(2)}</span>
                                </div>
                            )}
                            {hasManualDeposit && (
                                <div className="flex justify-between py-2 border-b border-border">
                                    <span className="text-muted-foreground">Default Deposit (50% Retail)</span>
                                    <span className="font-medium">£{pricing.defaultDepositAmount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between py-2 border-b border-border">
                                <span className="text-muted-foreground">{hasManualDeposit ? 'Deposit (Manual)' : 'Deposit'}</span>
                                <span className="font-medium">£{pricing.depositAmount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between py-3 border-t-2 border-foreground mt-2">
                                <span className="font-bold text-lg">Total Due</span>
                                <span className="font-bold text-lg text-green-700">£{pricing.totalDue.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Payment Info */}
                        <div className="mb-8 bg-muted/50 p-4 rounded text-xs text-muted-foreground">
                            <h3 className="font-bold text-foreground mb-2 uppercase tracking-wider">Payment Instructions</h3>
                            <p className="whitespace-pre-wrap">{bankInfo}</p>
                            <p className="mt-2 text-muted-foreground/70 italic">Please include Invoice #{invoiceIdDisplay} in the memo.</p>
                        </div>

                        {/* Terms / Notes Preview */}
                        <div className="mb-4 bg-yellow-50 p-4 rounded text-xs text-foreground border border-yellow-100">
                            <h3 className="font-bold text-yellow-800 mb-1 uppercase tracking-wider">Terms / Notes</h3>
                            {notes && (
                                <p className="whitespace-pre-wrap mb-2">{notes}</p>
                            )}
                            <p className="whitespace-pre-wrap">{lateFeeNotice}</p>
                        </div>

                        {/* Footer */}
                        <div className="text-center text-muted-foreground/70 text-xs mt-8 pt-4 border-t border-border">
                            Thank you for your business!
                        </div>
                    </div>

                    {/* EDITABLE FIELDS (Outside the preview visual) */}
                    <div className="space-y-2 bg-muted/50 p-4 rounded-lg border border-border">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="confirmed-start-date" className="text-sm font-medium text-foreground">
                                    Confirmed Call-in Date
                                </Label>
                                <Input
                                    id="confirmed-start-date"
                                    type="date"
                                    value={confirmedStartDateInput}
                                    onChange={(e) => setConfirmedStartDateInput(e.target.value)}
                                    className="bg-card"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmed-end-date" className="text-sm font-medium text-foreground">
                                    Confirmed Return Date
                                </Label>
                                <Input
                                    id="confirmed-end-date"
                                    type="date"
                                    value={confirmedEndDateInput}
                                    onChange={(e) => setConfirmedEndDateInput(e.target.value)}
                                    className="bg-card"
                                />
                            </div>
                        </div>
                        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-[11px] uppercase tracking-wider text-blue-700">Client Request Dates</p>
                                    <p className="mt-1 text-sm font-medium text-blue-950">{requestedDateSummary}</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="bg-card"
                                    onClick={() => {
                                        setConfirmedStartDateInput(requestedStartDate)
                                        setConfirmedEndDateInput(requestedEndDate)
                                    }}
                                    disabled={usesRequestedDates}
                                >
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                    Use Client Request Dates
                                </Button>
                            </div>
                        </div>
                        <div className="rounded border border-border bg-card px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Shoot / Event Location</p>
                            <p className="mt-1 text-sm text-foreground">{eventLocation || 'Not provided'}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Location stays read-only in this step.</p>
                        </div>
                        <div className="space-y-3 rounded border border-border bg-card px-3 py-3">
                            <div>
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Items Included In Invoice</p>
                                <p className="mt-1 text-xs text-muted-foreground">Remove unavailable items here. Pricing updates immediately.</p>
                            </div>
                            {keptItems.length === 0 ? (
                                <p className="rounded border border-dashed border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                                    No items are currently included. Restore at least one item before sending the invoice.
                                </p>
                            ) : (
                                keptItems.map((item) => (
                                    <div key={item.reservationId} className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                                            <p className="text-xs text-muted-foreground">Retail value: £{item.retailPrice.toFixed(2)}</p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0"
                                            onClick={() => handleRemoveItem(item.reservationId)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Remove
                                        </Button>
                                    </div>
                                ))
                            )}
                            {removedItems.length > 0 && (
                                <div className="space-y-2 rounded border border-amber-200 bg-amber-50 px-3 py-3">
                                    <div>
                                        <p className="text-[11px] uppercase tracking-wider text-amber-700">Removed / Unavailable Items</p>
                                        <p className="mt-1 text-xs text-amber-800">These stay visible for history but will not be invoiced.</p>
                                    </div>
                                    {removedItems.map((item) => (
                                        <div key={item.reservationId} className="flex items-center justify-between gap-3 rounded border border-amber-100 bg-card px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                                                <p className="text-xs text-amber-700">Marked unavailable for this approval.</p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="shrink-0 bg-card"
                                                onClick={() => handleRestoreItem(item.reservationId)}
                                            >
                                                <Undo2 className="mr-2 h-4 w-4" />
                                                Restore
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {!hasValidDateRange && (
                            <p className="text-xs text-red-600">
                                Confirmed return date must be on or after the call-in date.
                            </p>
                        )}
                        {!hasSelectedItems && (
                            <p className="text-xs text-red-600">
                                Keep at least one available item before sending the invoice.
                            </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-foreground">
                                    Discount Percentage
                                </Label>
                                <Select
                                    value={discountPercentageInput}
                                    onValueChange={setDiscountPercentageInput}
                                >
                                    <SelectTrigger className="w-full bg-card">
                                        <SelectValue placeholder="Select discount" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DISCOUNT_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="deposit-override" className="text-sm font-medium text-foreground">
                                    Deposit
                                </Label>
                                <Input
                                    id="deposit-override"
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={depositAmountOverrideInput}
                                    onChange={(e) => setDepositAmountOverrideInput(e.target.value)}
                                    placeholder="0 to waive or custom"
                                    className="bg-card"
                                />
                                <p className="text-xs text-muted-foreground">Blank = default (50% of retail value).</p>
                            </div>
                        </div>
                        <Label htmlFor="invoice-notes" className="text-sm font-medium text-foreground">
                            Add Note to Invoice
                        </Label>
                        <Textarea
                            id="invoice-notes"
                            placeholder="Type here to see it update in the preview above..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="resize-none bg-card"
                            rows={2}
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleApprove}
                        disabled={isPending || billingProfiles.length === 0 || !hasValidDateRange || !hasSelectedItems}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isPending ? 'Processing...' : 'Confirm & Send Invoice'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
