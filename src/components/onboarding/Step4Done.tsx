'use client'

import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'

/**
 * BRIEF-05 step 4 — Completion / dashboard handoff.
 *
 * Last step: a quick checklist of what was set up and a CTA into the
 * dashboard. Wizard's "Finish" button calls onFinish which fires the
 * server action `finishOnboardingAction` (marks onboarding_completed_at
 * on organizations.settings) and closes the modal.
 */

export interface Step4DoneProps {
    orgSlug: string
    onFinish: () => void
}

export function Step4Done({ orgSlug, onFinish }: Step4DoneProps) {
    return (
        <div className="space-y-4 text-center py-2">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>

            <div className="space-y-1">
                <h3 className="text-base font-medium">You&apos;re all set</h3>
                <p className="text-sm text-muted-foreground">
                    Your workspace at <strong>lende.shipbyx.com/{orgSlug}</strong> is
                    ready. Here&apos;s what you can do next:
                </p>
            </div>

            <ul className="text-left text-sm space-y-2 max-w-xs mx-auto">
                <li className="flex gap-2">
                    <span className="text-muted-foreground">·</span>
                    <span>Add the rest of your catalog (manual or Catalog Import)</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-muted-foreground">·</span>
                    <span>Invite teammates from Settings → Members</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-muted-foreground">·</span>
                    <span>Verify your email so we can send booking notifications</span>
                </li>
            </ul>

            <Button type="button" onClick={onFinish} className="w-full">
                Open my dashboard
            </Button>
        </div>
    )
}
