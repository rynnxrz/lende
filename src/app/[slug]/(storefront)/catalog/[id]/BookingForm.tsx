"use client"

import * as React from "react"
import { format, parse } from "date-fns"
import { CalendarIcon, ArrowLeft } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { useRequestStore } from "@/store/request"
import { toast } from "sonner"

interface BookingFormProps {
    item: {
        id: string
        name: string
        category: string
        rental_price: number
        image_paths: string[] | null
        status: string
    }
    orgSlug: string
}

export function BookingForm({ item, orgSlug }: BookingFormProps) {
    const catalogHref = `/${orgSlug}/catalog`
    const [isMounted, setIsMounted] = React.useState(false)

    const { dateRange: globalDateRange, addItem, removeItem, hasItem } = useRequestStore()
    const hasGlobalDate = !!(globalDateRange.from && globalDateRange.to)

    const parsedDateRange = React.useMemo(() => {
        if (!globalDateRange.from || !globalDateRange.to) return null
        return {
            from: parse(globalDateRange.from, 'yyyy-MM-dd', new Date()),
            to: parse(globalDateRange.to, 'yyyy-MM-dd', new Date())
        }
    }, [globalDateRange])

    const rentalDays = React.useMemo(() => {
        if (!parsedDateRange) return 0
        return Math.round((parsedDateRange.to.getTime() - parsedDateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
    }, [parsedDateRange])

    const rentalWeeks = React.useMemo(() => {
        if (rentalDays <= 0) return 0
        return Math.ceil(rentalDays / 7)
    }, [rentalDays])

    React.useEffect(() => {
        setIsMounted(true)
    }, [])

    const handleAddToRequest = () => {
        addItem(item)
        toast.success("Item added to request list")
    }

    if (!hasGlobalDate) {
        return (
            <div className="space-y-4">
                <div className="hidden md:block">
                    <Link href={catalogHref}>
                        <Button
                            variant="outline"
                            className="w-full h-12 rounded-md text-sm border-slate-300 text-slate-600 hover:bg-slate-50"
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Select Dates First
                        </Button>
                    </Link>
                </div>

                <div className="h-16 md:hidden" />
                <div
                    className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-100 z-50 md:hidden"
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
                >
                    <Link href={catalogHref}>
                        <Button
                            variant="outline"
                            className="w-full h-12 rounded-md text-sm border-slate-300 text-slate-600"
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Select Dates First
                        </Button>
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="md:hidden">
                <div className="h-12 flex items-center px-3 border border-slate-200 rounded-md bg-slate-50/50">
                    <CalendarIcon className="mr-2 h-4 w-4 text-slate-700" aria-hidden="true" />
                    <span className="text-sm text-slate-900">
                        {format(parsedDateRange!.from, "LLL dd")} - {format(parsedDateRange!.to, "LLL dd")}
                    </span>
                </div>
                <div className="text-[11px] mt-1.5 pl-1 text-green-700 font-semibold">
                    ✓ Available to request ({rentalDays} day{rentalDays === 1 ? '' : 's'})
                </div>
            </div>

            <div className="hidden md:flex md:gap-3 md:items-start">
                <div className="flex-[0_0_65%]">
                    <div className="h-12 flex items-center px-3 border border-slate-200 rounded-md bg-slate-50/50">
                        <CalendarIcon className="mr-2 h-4 w-4 text-slate-700" aria-hidden="true" />
                        <span className="text-sm text-slate-900">
                            {format(parsedDateRange!.from, "LLL dd")} - {format(parsedDateRange!.to, "LLL dd")}
                        </span>
                    </div>
                    <div className="text-[11px] mt-1.5 pl-1 text-green-700 font-semibold">
                        ✓ Available to request ({rentalDays} day{rentalDays === 1 ? '' : 's'})
                    </div>
                </div>

                <div className="flex-[0_0_35%]">
                    {isMounted && hasItem(item.id) ? (
                        <Button
                            variant="outline"
                            className="w-full h-12 rounded-md text-xs uppercase tracking-widest border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none"
                            onClick={() => {
                                removeItem(item.id)
                                toast("Item removed from request list")
                            }}
                            aria-label={`Remove ${item.name} from your request list`}
                            aria-pressed="true"
                        >
                            ✕ Remove
                        </Button>
                    ) : (
                        <Button
                            className="w-full h-12 rounded-md text-xs uppercase tracking-widest focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none"
                            onClick={handleAddToRequest}
                            aria-label={`Add ${item.name} to your request list`}
                            aria-pressed="false"
                        >
                            + Add to List
                        </Button>
                    )}
                </div>
            </div>

            <div
                className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-100 z-50 md:hidden"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
            >
                {isMounted && hasItem(item.id) ? (
                    <Button
                        variant="outline"
                        className="w-full h-12 rounded-md uppercase tracking-widest text-sm border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none"
                        onClick={() => {
                            removeItem(item.id)
                            toast("Item removed from request list")
                        }}
                        aria-label={`Remove ${item.name} from your request list`}
                    >
                        ✕ Remove from List
                    </Button>
                ) : (
                    <Button
                        className="w-full h-12 rounded-md uppercase tracking-widest text-sm shadow-lg focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none"
                        onClick={handleAddToRequest}
                        aria-label={`Add ${item.name} to your request list`}
                    >
                        Add to Request List
                    </Button>
                )}
            </div>
        </div>
    )
}
