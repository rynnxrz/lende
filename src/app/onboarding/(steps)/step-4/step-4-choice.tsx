'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, Plus, FileText } from 'lucide-react'
import { seedSampleAction } from '@/app/actions/onboarding/seed-sample'
import { track } from '@/lib/analytics/track'

interface Step4ChoiceProps {
    organizationId: string
    orgSlug: string
}

export function Step4Choice({ organizationId, orgSlug }: Step4ChoiceProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const handleSeed = () => {
        setError(null)
        startTransition(async () => {
            const result = await seedSampleAction(organizationId)
            if (!result.ok) {
                setError(result.error)
                return
            }
            track('signup_completed', {
                kind: 'sample_seeded',
                items_inserted: result.itemsInserted,
            })
            router.push(`/${orgSlug}/admin/listings`)
            router.refresh()
        })
    }

    return (
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
                type="button"
                onClick={handleSeed}
                disabled={isPending}
                className="group relative flex flex-col text-left rounded-md border-2 border-primary bg-card p-6 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
                <Sparkles className="h-5 w-5 text-foreground" aria-hidden />
                <h2 className="mt-4 text-lg font-medium text-foreground">
                    Use sample data
                </h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Copy 20 listings from our reference studio so you can explore the
                    workspace immediately. Delete them any time.
                </p>
                <span className="mt-4 inline-block text-xs font-medium tracking-[0.15em] uppercase text-foreground">
                    {isPending ? 'Adding…' : 'Recommended →'}
                </span>
            </button>

            <Link
                href={`/${orgSlug}/admin/listings`}
                className="group flex flex-col rounded-md border border-border bg-card p-6 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
                <Plus className="h-5 w-5 text-foreground" aria-hidden />
                <h2 className="mt-4 text-lg font-medium text-foreground">Add manually</h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Start from a blank listing. Best if you have a small inventory and
                    want full control.
                </p>
                <span className="mt-4 inline-block text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground">
                    Add one →
                </span>
            </Link>

            <div
                aria-disabled
                className="flex flex-col rounded-md border border-dashed border-border bg-muted/30 p-6 cursor-not-allowed"
            >
                <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
                <h2 className="mt-4 text-lg font-medium text-muted-foreground">
                    Import from PDF
                </h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Drop a supplier price-list PDF and we&apos;ll extract listings.
                </p>
                <span className="mt-4 inline-block text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground">
                    Coming soon
                </span>
            </div>

            {error && (
                <div
                    role="alert"
                    className="md:col-span-3 rounded-md bg-red-50 p-3 text-sm text-red-600"
                >
                    {error}
                </div>
            )}
        </div>
    )
}
