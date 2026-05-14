'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Step1Branding } from './Step1Branding'
import { Step2BusinessConfig } from './Step2BusinessConfig'
import { Step3FirstProduct } from './Step3FirstProduct'
import { Step4Done } from './Step4Done'
import { saveOnboardingStepAction, finishOnboardingAction } from '@/app/actions/auth/onboarding'

/**
 * BRIEF-05 — 4-step onboarding wizard.
 *
 * Activated when the admin landing has `?onboarding=1`. Each step writes
 * its result through a server action so a refresh halfway doesn't lose
 * progress.
 *
 *   Step 1 — Branding (logo, displayed name confirmed)
 *   Step 2 — Business config (currency, turnaround days, contact email)
 *   Step 3 — First product (manual entry OR Catalog Import)
 *   Step 4 — Done summary + dismiss
 *
 * The wizard is a modal Dialog so it doesn't block the user from
 * exploring the admin in the background — they can close at any step
 * and finish onboarding later (the URL flag persists via a
 * `organizations.settings.onboarding_step` JSONB field set by the
 * server action).
 */

export interface OnboardingWizardProps {
    orgSlug: string
    storeName: string
    /** Existing onboarding step from organizations.settings, or 0. */
    initialStep?: number
}

const TOTAL_STEPS = 4

export function OnboardingWizard({
    orgSlug,
    storeName,
    initialStep = 1,
}: OnboardingWizardProps) {
    const router = useRouter()
    const params = useSearchParams()
    const [, startTransition] = useTransition()
    const [step, setStep] = useState(Math.max(1, Math.min(TOTAL_STEPS, initialStep)))
    const [open, setOpen] = useState(true)
    const [step2Data, setStep2Data] = useState<{
        currency: string
        turnaroundDays: number
        contactEmail: string
    } | null>(null)

    const close = () => {
        setOpen(false)
        // Strip ?onboarding=1 from the URL so refresh doesn't re-open.
        const next = new URLSearchParams(params.toString())
        next.delete('onboarding')
        const qs = next.toString()
        router.replace(window.location.pathname + (qs ? '?' + qs : ''))
    }

    const persistStep = (n: number, payload?: Record<string, unknown>) => {
        startTransition(async () => {
            await saveOnboardingStepAction({ orgSlug, step: n, payload }).catch(() => {})
        })
    }

    const goNext = (payload?: Record<string, unknown>) => {
        const next = step + 1
        persistStep(step, payload)
        if (next > TOTAL_STEPS) {
            startTransition(async () => {
                await finishOnboardingAction({ orgSlug }).catch(() => {})
                close()
                router.refresh()
            })
            return
        }
        setStep(next)
    }

    const goBack = () => {
        if (step > 1) setStep(step - 1)
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) close()
            }}
        >
            <DialogContent
                className="max-w-lg"
                data-testid="onboarding-wizard"
                aria-describedby="onboarding-step-content"
            >
                <DialogHeader>
                    <DialogTitle>
                        Welcome to {storeName} — Step {step} of {TOTAL_STEPS}
                    </DialogTitle>
                </DialogHeader>

                <div id="onboarding-step-content" className="py-2">
                    {/* Step content */}
                    {step === 1 && (
                        <Step1Branding
                            orgSlug={orgSlug}
                            storeName={storeName}
                            onComplete={(payload) => goNext(payload)}
                        />
                    )}
                    {step === 2 && (
                        <Step2BusinessConfig
                            initial={step2Data ?? undefined}
                            onComplete={(data) => {
                                setStep2Data(data)
                                goNext(data as unknown as Record<string, unknown>)
                            }}
                        />
                    )}
                    {step === 3 && (
                        <Step3FirstProduct
                            orgSlug={orgSlug}
                            onComplete={(payload) => goNext(payload)}
                        />
                    )}
                    {step === 4 && (
                        <Step4Done
                            orgSlug={orgSlug}
                            onFinish={() => goNext()}
                        />
                    )}
                </div>

                <div className="flex items-center justify-between pt-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={goBack}
                        disabled={step === 1}
                    >
                        Back
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={close}
                    >
                        Skip for now
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
