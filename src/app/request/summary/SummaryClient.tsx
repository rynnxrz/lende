"use client"

import * as React from "react"
import { useRequestStore } from "@/store/request"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES } from "@/lib/constants/countries"
import { Loader2, ArrowLeft, Calendar, QrCode } from "lucide-react"
import { submitBulkRequest } from "@/actions/bulkRequest"
import { toast } from "sonner"
import { Copy } from "lucide-react"
import { SITE_CONFIG } from "@/config/site"
import { CustomerServiceWidget } from "@/components/customer-service/CustomerServiceWidget"
import {
    buildTieredPricingDisplay,
    MONTHLY_BRIDGE_NOTICE,
    TIER_AMOUNT_UNAVAILABLE_MESSAGE,
} from "@/lib/invoice/tiered-display"
import { PricingDisplay } from "@/components/PricingDisplay"
import {
    normalizeBillableDays,
} from "@/lib/invoice/pricing"

interface SummaryClientProps {
    orgSlug: string
}

export function SummaryClient({ orgSlug }: SummaryClientProps) {
    const { items, dateRange, clearRequest, contactInfo, setContactInfo } = useRequestStore()
    const router = useRouter()
    const [isSubmitting, startSubmitTransition] = React.useTransition()
    const [hasCopied, setHasCopied] = React.useState(false)

    // Fail-safe State
    const [openCountry, setOpenCountry] = React.useState(false)
    const [recoveryStatus, setRecoveryStatus] = React.useState<'BACKUP_SAVED' | 'BACKUP_FAILED' | null>(null)
    // Initialize fingerprint lazily so it persists across renders but only generates once per mount
    const [fingerprint] = React.useState(() => {
        if (typeof window !== 'undefined') {
            let fp = sessionStorage.getItem('current_request_fingerprint')
            if (!fp) {
                fp = `REQ-${Date.now()}-${Math.random().toString(36).slice(2)}`
                sessionStorage.setItem('current_request_fingerprint', fp)
            }
            return fp
        }
        return ''
    })

    // Derived State
    const fromDate = dateRange.from ? new Date(dateRange.from) : null
    const toDate = dateRange.to ? new Date(dateRange.to) : null
    const hasDates = Boolean(fromDate && toDate)
    const days = hasDates
        ? normalizeBillableDays(
            Math.round((toDate!.getTime() - fromDate!.getTime()) / (1000 * 60 * 60 * 24)) + 1
        )
        : 0
    const durationPricing = buildTieredPricingDisplay({
        replacementCost: null,
        selectedDays: hasDates ? days : null,
    })
    const usesMonthlyBridgeRate = durationPricing.isMonthlyBridge
    const itemPricing = items.map((item) => ({
        itemId: item.id,
        display: buildTieredPricingDisplay({
            replacementCost: item.replacement_cost,
            selectedDays: hasDates ? days : null,
        }),
    }))
    const itemPricingById = new Map(itemPricing.map((entry) => [entry.itemId, entry.display]))
    const unavailableEstimateCount = hasDates
        ? itemPricing.filter((entry) => entry.display.selectedEstimate === null).length
        : 0
    const totalEstimate = itemPricing.reduce((sum, entry) => sum + (entry.display.selectedEstimate ?? 0), 0)
    const showEmergencyPanel = recoveryStatus !== null

    React.useEffect(() => {
        setHasCopied(false)
    }, [recoveryStatus])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!hasDates) {
            toast.error("Please select dates first")
            return
        }

        startSubmitTransition(() => {
            void (async () => {
                try {
                    const result = await submitBulkRequest({
                        items: items.map(i => i.id),
                        items_detail: items.map(i => ({ id: i.id, name: i.name })),
                        email: contactInfo.email,
                        full_name: contactInfo.full_name,
                        start_date: dateRange.from!,
                        end_date: dateRange.to!,
                        company_name: contactInfo.company_name,
                        event_location: contactInfo.event_location || '',
                        address_line1: contactInfo.address_line1,
                        address_line2: contactInfo.address_line2,
                        city_region: contactInfo.city_region,
                        country: contactInfo.country,
                        postcode: contactInfo.postcode,
                        access_password: contactInfo.access_password,
                        notes: contactInfo.notes,
                        fingerprint
                    }, orgSlug)

                    if (result.success === false) {
                        setRecoveryStatus(result.recoveryStatus ?? 'BACKUP_FAILED')
                        toast.error(result.error || 'Submission failed. Backup options are ready below.')
                        return
                    }

                    if (result.error) {
                        toast.error(result.error)
                        return
                    }

                    if (result.success) {
                        toast.success('Request submitted successfully')
                        sessionStorage.setItem('latest_submitted_request_fingerprint', fingerprint)
                        sessionStorage.setItem('latest_submitted_request_email', contactInfo.email)
                        sessionStorage.removeItem('current_request_fingerprint')
                        setRecoveryStatus(null)
                        clearRequest()
                        router.push('/request/success')
                    }
                } catch (err) {
                    console.error('Submission error:', err)
                    setRecoveryStatus('BACKUP_FAILED')
                    toast.error('An unexpected error occurred. Backup options are ready below.')
                }
            })()
        })
    }

    const getSubmissionData = () => ({
        items: items.map(i => ({ id: i.id, name: i.name, price: i.rental_price })),
        customer: {
            full_name: contactInfo.full_name,
            email: contactInfo.email,
            company_name: contactInfo.company_name,
            event_location: contactInfo.event_location || '',
            address: {
                line1: contactInfo.address_line1,
                line2: contactInfo.address_line2,
                city: contactInfo.city_region,
                country: contactInfo.country,
                postcode: contactInfo.postcode
            }
        },
        dates: {
            from: dateRange.from,
            to: dateRange.to,
            days
        },
        notes: contactInfo.notes,
        total_estimate: totalEstimate,
        fingerprint
    })

    const handleCopyToClipboard = () => {
        const data = getSubmissionData()
        const jsonString = JSON.stringify(data, null, 2)
        const base64Json = btoa(unescape(encodeURIComponent(jsonString)))
        const itemNames = items.map(i => i.name).join(', ')
        const dateStr = hasDates ? `${format(fromDate!, 'MMM d')} - ${format(toDate!, 'MMM d')}` : 'Dates not set'
        const summary = [
            'My rental request failed, please review these details:',
            `Name: ${contactInfo.full_name}`,
            `Email: ${contactInfo.email}`,
            `Event Location: ${contactInfo.event_location || 'Not provided'}`,
            `Dates: ${dateStr}`,
            `Items: ${itemNames || 'None'}`,
            '',
            '--- CODE (Base64, do not edit) ---',
            base64Json
        ].join('\n')

        navigator.clipboard.writeText(summary)
            .then(() => {
                setHasCopied(true)
                toast.success('Details copied to clipboard.')
                setTimeout(() => setHasCopied(false), 3000)
            })
            .catch(() => toast.error('Failed to copy summary'))
    }

    const getImageUrl = (images: string[] | null) => {
        if (images && images.length > 0) return images[0]
        return 'https://placehold.co/100x100.png?text=No+Img'
    }

    return (
        <main id="main-content" tabIndex={-1} className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8" aria-label="Request summary">
            <div className="max-w-6xl mx-auto">
                <Button
                    variant="ghost"
                    className="mb-8 pl-0 hover:bg-transparent hover:text-gray-900 text-gray-500"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Button>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                    {/* Left Column: Summary */}
                    <div className="lg:col-span-7 space-y-8">
                        <div>
                            <h1 className="text-3xl font-light text-gray-900 mb-2">Review Request</h1>
                            <p className="text-gray-500">Please review your selected items and dates before submitting.</p>
                        </div>

                        {/* Date Card */}
                        <div className="bg-white p-6 rounded-sm shadow-sm border border-gray-100 flex items-center gap-4">
                            <div className="h-12 w-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-700">
                                <Calendar className="h-6 w-6" aria-hidden="true" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Requested Dates</p>
                                {hasDates ? (
                                    <p className="text-lg text-gray-900">
                                        {format(fromDate!, 'MMM d, yyyy')} - {format(toDate!, 'MMM d, yyyy')}
                                        <span className="text-gray-700 ml-2 text-base font-semibold">({days} days)</span>
                                    </p>
                                ) : (
                                    <p className="text-red-500">Dates not selected</p>
                                )}
                            </div>
                        </div>

                        {/* Items List */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-medium text-gray-900">Selected Items ({items.length})</h2>
                            <div className="bg-white rounded-sm shadow-sm border border-gray-100 divide-y divide-gray-100">
                                {items.map((item) => (
                                    <div key={item.id} className="p-4 flex gap-4">
                                        <div className="relative h-24 w-24 bg-gray-100 rounded-sm overflow-hidden flex-shrink-0">
                                            <Image
                                                src={getImageUrl(item.image_paths)}
                                                alt={`${item.name} fine jewelry piece`}
                                                fill
                                                className="object-cover"
                                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                                            <div>
                                                <h3 className="font-medium text-gray-900">{item.name}</h3>
                                                <p className="text-sm text-gray-500 capitalize">{item.category}</p>
                                            </div>
                                            {(() => {
                                                const tieredPricing = itemPricingById.get(item.id)
                                                if (!tieredPricing) return null
                                                return (
                                                    <PricingDisplay 
                                                        tieredPricing={tieredPricing} 
                                                        hasDates={hasDates} 
                                                        size="sm" 
                                                        className="mt-2"
                                                    />
                                                )
                                            })()}
                                        </div>
                                    </div>
                                ))}
                                {usesMonthlyBridgeRate && (
                                    <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-y border-amber-100">
                                        {MONTHLY_BRIDGE_NOTICE} for 15-29 day rentals.
                                    </div>
                                )}
                                {hasDates && unavailableEstimateCount > 0 && (
                                    <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-y border-amber-100">
                                        {TIER_AMOUNT_UNAVAILABLE_MESSAGE} ({unavailableEstimateCount} item{unavailableEstimateCount > 1 ? 's' : ''}).
                                    </div>
                                )}
                                <div className="p-4 bg-gray-50 flex justify-between items-center text-lg font-medium">
                                    <span>{hasDates && unavailableEstimateCount > 0 ? 'Estimated Total (available items)' : 'Estimated Total'}</span>
                                    <span>£{totalEstimate.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Form */}
                    <div className="lg:col-span-5">
                        <div className="bg-white p-8 rounded-sm shadow-sm border border-gray-100 sticky top-8">

                            <h2 className="text-xl font-light text-gray-900 mb-6">Contact Information</h2>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Full Name</Label>
                                    <Input
                                        id="fullName"
                                        value={contactInfo.full_name}
                                        onChange={e => setContactInfo({ full_name: e.target.value })}
                                        required
                                        placeholder="Jane Doe"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={contactInfo.email}
                                        onChange={e => setContactInfo({ email: e.target.value })}
                                        required
                                        placeholder="jane@company.com"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="company">Company (Optional)</Label>
                                    <Input
                                        id="company"
                                        value={contactInfo.company_name}
                                        onChange={e => setContactInfo({ company_name: e.target.value })}
                                        placeholder="Company Ltd."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <div className="pt-6 border-t border-gray-100">
                                        <h3 className="text-lg font-light text-gray-900 mb-4">Address Details</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 space-y-0">
                                            <div className="space-y-2">
                                                <Label>Country/Region</Label>
                                                <Popover open={openCountry} onOpenChange={setOpenCountry}>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            role="combobox"
                                                            aria-expanded={openCountry}
                                                            aria-controls="country-list"
                                                            aria-label="Select country or region"
                                                            className="w-full justify-between font-normal text-left h-12 min-h-[44px] px-3 py-2 border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            {contactInfo.country
                                                                ? COUNTRIES.find((c) => c === contactInfo.country)
                                                                : "Select country..."}
                                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent id="country-list" className="w-[300px] p-0" align="start">
                                                        <Command>
                                                            <CommandInput placeholder="Search country..." />
                                                            <CommandList>
                                                                <CommandEmpty>No country found.</CommandEmpty>
                                                                <CommandGroup>
                                                                    {COUNTRIES.map((c) => (
                                                                        <CommandItem
                                                                            key={c}
                                                                            value={c}
                                                                            onSelect={(currentValue: string) => {
                                                                                setContactInfo({ country: currentValue === contactInfo.country ? "" : currentValue })
                                                                                setOpenCountry(false)
                                                                            }}
                                                                        >
                                                                            <Check
                                                                                className={cn(
                                                                                    "mr-2 h-4 w-4",
                                                                                    contactInfo.country === c ? "opacity-100" : "opacity-0"
                                                                                )}
                                                                            />
                                                                            {c}
                                                                        </CommandItem>
                                                                    ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="cityRegion">City / Town</Label>
                                                <Input
                                                    id="cityRegion"
                                                    value={contactInfo.city_region}
                                                    onChange={e => setContactInfo({ city_region: e.target.value })}
                                                    required
                                                    placeholder="City"
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-2">
                                                <Label htmlFor="addressLine1">Street Address</Label>
                                                <Input
                                                    id="addressLine1"
                                                    value={contactInfo.address_line1}
                                                    onChange={e => setContactInfo({ address_line1: e.target.value })}
                                                    required
                                                    placeholder="Street address, P.O. box, company name, c/o"
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-2">
                                                <Label htmlFor="addressLine2">Apt, Suite, etc. (Optional)</Label>
                                                <Input
                                                    id="addressLine2"
                                                    value={contactInfo.address_line2}
                                                    onChange={e => setContactInfo({ address_line2: e.target.value })}
                                                    placeholder="Apartment, suite, unit, building, floor, etc."
                                                />
                                            </div>
                                            <div className="md:col-span-1 space-y-2">
                                                <Label htmlFor="postcode">Postcode / ZIP</Label>
                                                <Input
                                                    id="postcode"
                                                    value={contactInfo.postcode}
                                                    onChange={e => setContactInfo({ postcode: e.target.value })}
                                                    required
                                                    placeholder="ZIP code"
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-2">
                                                <Label htmlFor="eventLocation">Shoot / Event Location</Label>
                                                <Input
                                                    id="eventLocation"
                                                    value={contactInfo.event_location || ''}
                                                    onChange={e => setContactInfo({ event_location: e.target.value })}
                                                    required
                                                    placeholder="Studio, venue, or event address"
                                                />
                                                <p className="text-xs text-gray-500">
                                                    This becomes the read-only location shown in the final loan form.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mt-6">
                                        <Label htmlFor="notes">Notes (Optional)</Label>
                                        <Textarea
                                            id="notes"
                                            value={contactInfo.notes}
                                            onChange={e => setContactInfo({ notes: e.target.value })}
                                            placeholder="Any special requests or instructions..."
                                            className="resize-none h-24"
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-gray-100">
                                    <div className="space-y-2">
                                        <Label htmlFor="accessPassword">Access Password</Label>
                                        <Input
                                            id="accessPassword"
                                            type="password"
                                            value={contactInfo.access_password}
                                            onChange={e => setContactInfo({ access_password: e.target.value })}
                                            placeholder="Enter if required"
                                        />
                                        <p className="text-xs text-gray-500">
                                            If you have been provided with an access code, please enter it here.
                                        </p>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-14 text-base uppercase tracking-widest mt-6"
                                    disabled={isSubmitting || items.length === 0}
                                    aria-busy={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        'Submit Request'
                                    )}
                                </Button>

                                {showEmergencyPanel && (
                                    <div
                                        className={`mt-6 rounded-lg border-2 p-5 animate-in fade-in slide-in-from-top-4 ${recoveryStatus === 'BACKUP_SAVED'
                                            ? 'border-blue-300 bg-blue-50/50'
                                            : 'border-red-300 bg-red-50/50'
                                            }`}
                                    >
                                        <div className="space-y-4">
                                            {/* Title */}
                                            <h3 className="text-lg font-semibold text-gray-900">
                                                Request submission failed
                                            </h3>

                                            {/* Status-based description */}
                                            {recoveryStatus === 'BACKUP_SAVED' ? (
                                                <p className="text-sm text-gray-700 leading-relaxed">
                                                    We&apos;ve saved a copy of your request in our backup system. <strong>Ivy</strong> will review it soon, but you can still send it manually to be safe.
                                                </p>
                                            ) : (
                                                <>
                                                    <p className="text-sm text-gray-700 leading-relaxed">
                                                        We encountered a technical issue on our end. <strong>Ivy has not received your request.</strong>
                                                    </p>
                                                    <p className="text-sm text-gray-600 leading-relaxed">
                                                        To ensure you don&apos;t lose your selection, please <strong>send your request summary to Ivy manually</strong> via email or message:
                                                    </p>
                                                </>
                                            )}

                                            {/* Contact Options */}
                                            <div className="flex items-start gap-4 p-3 bg-white rounded-md border border-gray-200">
                                                {/* Left: Email */}
                                                <div className="flex-1 space-y-1">
                                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
                                                    <div className="flex items-center gap-2">
                                                        <a
                                                            href={`mailto:${SITE_CONFIG.contact_email}`}
                                                            className="text-sm font-medium text-blue-600 hover:underline"
                                                        >
                                                            {SITE_CONFIG.contact_email}
                                                        </a>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(SITE_CONFIG.contact_email)
                                                                toast.success('Email copied')
                                                            }}
                                                            className="p-1 text-gray-400 hover:text-gray-600 rounded"
                                                            aria-label="Copy email address"
                                                        >
                                                            <Copy className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {/* Right: QR Code Placeholder */}
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className="h-14 w-14 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
                                                        <QrCode className="h-7 w-7 text-gray-400" />
                                                    </div>
                                                    <span className="text-[10px] text-gray-500">Scan to Message</span>
                                                </div>
                                            </div>

                                            {/* Copy Request Button */}
                                            <Button
                                                onClick={handleCopyToClipboard}
                                                type="button"
                                                className={`w-full uppercase tracking-widest ${hasCopied
                                                        ? 'bg-green-600 hover:bg-green-700'
                                                        : recoveryStatus === 'BACKUP_SAVED'
                                                            ? 'bg-blue-600 hover:bg-blue-700'
                                                            : 'bg-red-600 hover:bg-red-700'
                                                    } text-white`}
                                            >
                                                {hasCopied ? (
                                                    <>
                                                        <Check className="mr-2 h-4 w-4" />
                                                        Details Copied
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="mr-2 h-4 w-4" />
                                                        Copy Request Summary
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>
                    </div>
                </div>
            </div>
            {/* LocalStorage Clear Button (Offline UX) */}
            <div className="mt-12 text-center border-t border-gray-100 pt-8">
                <p className="text-xs text-gray-400 mb-2">Form data is saved locally for 24 hours.</p>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-red-500 hover:bg-red-50"
                    onClick={() => {
                        if (confirm('Are you sure you want to clear all form data?')) {
                            clearRequest()
                            toast.success('Form data cleared')
                        }
                    }}
                >
                    Clear Form Data
                </Button>
            </div>
            <CustomerServiceWidget
                storageKey="customer-service:request-summary"
                baseContext={{
                    pageType: 'request_summary',
                    path: '/request/summary',
                    requestSummary: {
                        itemCount: items.length,
                        items: items.map(item => ({
                            id: item.id,
                            name: item.name,
                            rentalPrice: item.rental_price,
                        })),
                        dateFrom: dateRange.from,
                        dateTo: dateRange.to,
                        days,
                        totalEstimate,
                    },
                }}
                initialIdentityHints={{
                    email: contactInfo.email || null,
                    fingerprint,
                }}
            />
        </main>
    )
}
