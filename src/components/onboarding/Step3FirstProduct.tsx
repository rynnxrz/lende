'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Sparkles, Plus } from 'lucide-react'

/**
 * BRIEF-05 step 3 — First product.
 *
 * Two paths:
 *   - Manual: link out to /admin/items/new (or the org-scoped equivalent)
 *   - Catalog Import: link out to /admin/items/import
 *
 * Both routes pre-exist (single-tenant code base — they'll be made
 * org-scoped by BRIEF-03). For onboarding we just call onComplete with
 * the chosen path so the wizard records the choice and moves to step 4;
 * the user can come back to do the actual product entry — a banner on
 * the dashboard reminds them.
 */

export interface Step3FirstProductProps {
    orgSlug: string
    onComplete: (payload: { method: 'skip' | 'manual' | 'smart_import' }) => void
}

export function Step3FirstProduct({ orgSlug, onComplete }: Step3FirstProductProps) {
    const [hovered, setHovered] = useState<'manual' | 'smart_import' | null>(null)

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Add your first piece. You can do this now or come back later.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link
                    href={`/${orgSlug}/admin/items/new`}
                    onMouseEnter={() => setHovered('manual')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onComplete({ method: 'manual' })}
                    className={`block rounded-lg border p-4 text-left transition-colors ${
                        hovered === 'manual' ? 'border-blue-400 bg-blue-50' : 'border-border'
                    }`}
                >
                    <Plus className="h-5 w-5 mb-2 text-blue-600" />
                    <div className="font-medium text-sm">Add manually</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Type product name, price, photos. ~2 min per piece.
                    </p>
                </Link>

                <Link
                    href={`/${orgSlug}/admin/items/import`}
                    onMouseEnter={() => setHovered('smart_import')}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onComplete({ method: 'smart_import' })}
                    className={`block rounded-lg border p-4 text-left transition-colors ${
                        hovered === 'smart_import' ? 'border-purple-400 bg-purple-50' : 'border-border'
                    }`}
                >
                    <Sparkles className="h-5 w-5 mb-2 text-purple-600" />
                    <div className="font-medium text-sm">Catalog Import</div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Paste a supplier URL or lookbook PDF — AI fills the catalog.
                    </p>
                </Link>
            </div>

            <Button
                type="button"
                variant="ghost"
                onClick={() => onComplete({ method: 'skip' })}
                className="w-full text-muted-foreground"
            >
                Skip — I&apos;ll add products later
            </Button>
        </div>
    )
}
