import * as React from 'react'
import { render } from '@react-email/render'
import {
    Layout,
    SubjectLine,
    P,
    EmailButton,
    Spacer,
    Section,
    Row,
    Column,
    Text,
    colors,
    fonts,
    buildUnsubscribeUrl,
    buildManagePreferencesUrl,
    ensureAbsolute,
} from './_shared'

export interface OnboardingDay3Props {
    orgName: string
    adminUrl: string
    siteUrl?: string
    unsubscribeUrl?: string
    managePreferencesUrl?: string
}

const DEFAULT_SITE_URL = 'https://lende.shipbyx.com'

const SUBJECT =
    '3 things lende customers do in week 1 that double their reservation count.'

interface Tip {
    title: string
    body: string
    /** Inline SVG path data (lucide-style stroke) */
    iconPath: React.ReactNode
}

const TIPS: Tip[] = [
    {
        title: 'Photograph each item on a plain background.',
        body:
            "Customers can't rent what they can't see. One soft light, one neutral wall, phone camera. Ivy spends 12 minutes on this and it's the single biggest lever.",
        // Camera icon (ICam from email-shared.jsx)
        iconPath: (
            <>
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
            </>
        ),
    },
    {
        title: 'Set rental price at 8–12% of retail per day.',
        body:
            "Most new studios under-price. We've watched it: studios who land in this band see roughly 2× the bookings of studios who stay below 5%. Adjust later if needed.",
        // Tag icon (ITag)
        iconPath: (
            <>
                <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
            </>
        ),
    },
    {
        title: 'Approve requests within 4 hours.',
        body:
            'Customer interest decays fast. Turn on push notifications and keep approvals as a 1-tap habit — even just to say "checking, back to you tonight".',
        // Bolt icon (IBolt)
        iconPath: (
            <>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </>
        ),
    },
]

function TipCard({ tip, index }: { tip: Tip; index: number }) {
    const num = String(index + 1).padStart(2, '0')
    return (
        <Section
            style={{
                padding: '18px',
                border: `1px solid ${colors.border}`,
                borderRadius: '10px',
                backgroundColor: colors.surface,
            }}
        >
            <Row>
                <Column style={{ width: '44px', verticalAlign: 'top' }}>
                    <Text
                        aria-hidden
                        style={{
                            margin: 0,
                            display: 'inline-block',
                            width: '28px',
                            height: '28px',
                            lineHeight: '28px',
                            textAlign: 'center',
                            borderRadius: '6px',
                            backgroundColor: colors.text,
                            color: colors.surface,
                            fontFamily: fonts.mono,
                            fontSize: '12px',
                            letterSpacing: '0.12em',
                            fontWeight: 500,
                        }}
                    >
                        {num}
                    </Text>
                </Column>
                <Column style={{ width: '44px', verticalAlign: 'top' }}>
                    <Text
                        aria-hidden
                        style={{
                            margin: 0,
                            display: 'inline-block',
                            width: '28px',
                            height: '28px',
                            lineHeight: '28px',
                            textAlign: 'center',
                            borderRadius: '6px',
                            backgroundColor: colors.background,
                            color: colors.text,
                        }}
                    >
                        <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ verticalAlign: 'middle' }}
                            aria-hidden
                        >
                            {tip.iconPath}
                        </svg>
                    </Text>
                </Column>
                <Column style={{ verticalAlign: 'top' }}>
                    <Text
                        style={{
                            margin: 0,
                            fontSize: '14px',
                            fontWeight: 500,
                            color: colors.text,
                            lineHeight: 1.4,
                        }}
                    >
                        {tip.title}
                    </Text>
                    <Text
                        style={{
                            margin: '6px 0 0',
                            fontSize: '13px',
                            lineHeight: 1.6,
                            color: colors.muted,
                        }}
                    >
                        {tip.body}
                    </Text>
                </Column>
            </Row>
        </Section>
    )
}

export const OnboardingDay3 = ({
    orgName: _orgName,
    adminUrl,
    siteUrl = DEFAULT_SITE_URL,
    unsubscribeUrl,
    managePreferencesUrl,
}: OnboardingDay3Props) => {
    const adminAbs = ensureAbsolute(adminUrl, siteUrl)
    const unsub = unsubscribeUrl ?? buildUnsubscribeUrl(siteUrl)
    const manage = managePreferencesUrl ?? buildManagePreferencesUrl(siteUrl)

    return (
        <Layout
            preview="Patterns we see in your first week. Skim time: 60 seconds."
            unsubscribeUrl={unsub}
            managePreferencesUrl={manage}
        >
            <SubjectLine>{SUBJECT}</SubjectLine>
            <Spacer />
            <P>
                We watched the first 40 studios on lende. The ones who hit twice the
                reservation volume in their first month all did the same three things in
                week 1. None of them are clever. All of them are easy to skip.
            </P>
            <Spacer />
            {TIPS.map((tip, i) => (
                <React.Fragment key={i}>
                    <TipCard tip={tip} index={i} />
                    {i < TIPS.length - 1 && <Spacer height={12} />}
                </React.Fragment>
            ))}
            <Spacer />
            <Section>
                <EmailButton href={adminAbs}>Open my dashboard</EmailButton>
            </Section>
            <Spacer height={18} />
            <P small muted>
                — Rongze
            </P>
        </Layout>
    )
}

export default OnboardingDay3

export const onboardingDay3Subject = () => SUBJECT

export async function onboardingDay3Html(input: OnboardingDay3Props): Promise<string> {
    return render(<OnboardingDay3 {...input} />, { pretty: false })
}
