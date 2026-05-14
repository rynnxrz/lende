'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ComponentType } from 'react'
import type { EventData, Controls, Step, Props as JoyrideProps } from 'react-joyride'
import { EVENTS, STATUS } from 'react-joyride'
import { track } from '@/lib/analytics/track'

// react-joyride 3 reads from `window` at module-load time. Loading via
// next/dynamic with ssr:false (per BRIEF-48 Risk #2) keeps Next 16 + React 19
// from hydrating the portal on the server.
const Joyride = dynamic(
    () => import('react-joyride').then((m) => m.Joyride as ComponentType<JoyrideProps>),
    { ssr: false }
)

interface OnboardingTourProps {
    organizationId: string
    orgSlug: string
}

const STEPS: Step[] = [
    {
        target: '[data-tour="listings"]',
        content:
            'Your jewelry inventory lives here. Each listing = one item available for rental.',
        title: 'Listings · 1/5',
        skipBeacon: true,
        placement: 'right',
    },
    {
        target: '[data-tour="reservations"]',
        content:
            'Bookings, deposits, and pickups. Confirmed reservations show up on your calendar automatically.',
        title: 'Reservations · 2/5',
        placement: 'right',
    },
    {
        target: '[data-tour="team"]',
        content:
            'Invite teammates so multiple people can manage listings and reservations from the same workspace.',
        title: 'Team · 3/5',
        placement: 'right',
    },
    {
        target: '[data-tour="lookbook"]',
        content:
            'Soon: a customer-facing PDF lookbook so clients can browse your collection without logging in.',
        title: 'PDF Lookbook · 4/5',
        placement: 'right',
    },
    {
        target: '[data-tour="settings"]',
        content:
            "That's the tour. Settings is where you'll wire up email, billing, and your studio's URL slug. Ready when you are.",
        title: 'Settings · 5/5',
        placement: 'right',
    },
]

const FLAG_KEY = (orgId: string) => `onboarding-tour-completed-${orgId}`

export function OnboardingTour({ organizationId, orgSlug }: OnboardingTourProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const tourRequested = searchParams.get('tour') === '1'

    const [run, setRun] = useState(false)
    const [stepIndex, setStepIndex] = useState(0)
    const [hasStarted, setHasStarted] = useState(false)

    useEffect(() => {
        if (!tourRequested) return
        if (typeof window === 'undefined') return

        const completed = window.localStorage.getItem(FLAG_KEY(organizationId))
        if (completed === '1') {
            router.replace(`/${orgSlug}/admin`)
            return
        }

        setRun(true)
        setStepIndex(0)
    }, [tourRequested, organizationId, orgSlug, router])

    const handleEvent = useMemo(
        () => (data: EventData, _controls: Controls) => {
            const { index, status, type } = data

            if (!hasStarted && type === EVENTS.TOUR_START) {
                setHasStarted(true)
                track('signup_completed', {
                    kind: 'onboarding_tour_started',
                    org_id: organizationId,
                })
            }

            if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
                track('signup_completed', {
                    kind: 'onboarding_tour_step_completed',
                    org_id: organizationId,
                    step_index: index,
                })
                setStepIndex(index + 1)
            }

            if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(FLAG_KEY(organizationId), '1')
                }
                track('signup_completed', {
                    kind:
                        status === STATUS.SKIPPED
                            ? 'onboarding_tour_skipped'
                            : 'onboarding_tour_finished',
                    org_id: organizationId,
                })
                setRun(false)
                router.replace('/onboarding/step-4')
            }
        },
        [hasStarted, organizationId, router]
    )

    if (!run) return null

    return (
        <Joyride
            steps={STEPS}
            stepIndex={stepIndex}
            run={run}
            continuous
            onEvent={handleEvent}
            options={{
                showProgress: true,
                skipScroll: false,
                hideOverlay: false,
                overlayColor: 'rgba(15, 23, 42, 0.5)',
                overlayClickAction: false,
                primaryColor: '#0f172a',
                textColor: '#0f172a',
                backgroundColor: '#ffffff',
                arrowColor: '#ffffff',
                zIndex: 10000,
                buttons: ['back', 'skip', 'primary'],
            }}
            locale={{
                back: 'Back',
                close: 'Close',
                last: 'Got it',
                next: 'Next',
                skip: 'Skip tour',
            }}
            styles={{
                buttonPrimary: {
                    background: '#0f172a',
                    color: '#ffffff',
                    borderRadius: 'var(--radius)',
                    fontSize: '0.875rem',
                    padding: '0.5rem 1rem',
                },
                buttonBack: {
                    color: '#64748b',
                    fontSize: '0.875rem',
                },
                buttonSkip: {
                    color: '#64748b',
                    fontSize: '0.875rem',
                },
                tooltipContainer: {
                    textAlign: 'left',
                },
            }}
        />
    )
}
