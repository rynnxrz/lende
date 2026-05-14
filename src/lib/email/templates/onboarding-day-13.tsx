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

export interface OnboardingDay13Props {
    orgName: string
    pricingUrl: string
    listingCount: number
    siteUrl?: string
    unsubscribeUrl?: string
    managePreferencesUrl?: string
}

const DEFAULT_SITE_URL = 'https://lende.shipbyx.com'

interface PlanRow {
    name: string
    price: number
    desc: string
    best?: boolean
}

const PLAN_ROWS: PlanRow[] = [
    { name: 'Start', price: 19, desc: 'Up to 25 listings · 1 admin' },
    { name: 'Grow', price: 49, desc: 'Unlimited listings · 5 seats', best: true },
    { name: 'Scale', price: 129, desc: 'API · Smart Import · multi-location' },
]

function PlanRowCard({ plan }: { plan: PlanRow }) {
    return (
        <Section
            style={{
                padding: '14px 16px',
                border: `1px solid ${plan.best ? colors.text : colors.border}`,
                borderRadius: '10px',
                backgroundColor: colors.surface,
            }}
        >
            <Row>
                <Column style={{ width: '90px', verticalAlign: 'middle' }}>
                    <Text
                        style={{
                            margin: 0,
                            fontFamily: fonts.mono,
                            fontSize: '11px',
                            letterSpacing: '0.16em',
                            textTransform: 'uppercase',
                            color: plan.best ? colors.text : colors.muted,
                            lineHeight: 1,
                        }}
                    >
                        {plan.name}
                    </Text>
                </Column>
                <Column style={{ verticalAlign: 'middle' }}>
                    <Text
                        style={{
                            margin: 0,
                            fontSize: '13px',
                            color: colors.muted,
                            lineHeight: 1.5,
                        }}
                    >
                        {plan.desc}
                    </Text>
                </Column>
                <Column style={{ width: '90px', textAlign: 'right', verticalAlign: 'middle' }}>
                    <Text
                        style={{
                            margin: 0,
                            fontSize: '15px',
                            fontWeight: 500,
                            color: colors.text,
                            fontFamily: fonts.mono,
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap',
                            lineHeight: 1,
                        }}
                    >
                        ${plan.price}/mo
                    </Text>
                </Column>
            </Row>
        </Section>
    )
}

export const OnboardingDay13 = ({
    orgName: _orgName,
    pricingUrl,
    listingCount,
    siteUrl = DEFAULT_SITE_URL,
    unsubscribeUrl,
    managePreferencesUrl,
}: OnboardingDay13Props) => {
    const pricingAbs = ensureAbsolute(pricingUrl, siteUrl)
    const unsub = unsubscribeUrl ?? buildUnsubscribeUrl(siteUrl)
    const manage = managePreferencesUrl ?? buildManagePreferencesUrl(siteUrl)
    const subject = `24 hours left in your trial. Pick a plan to keep ${listingCount} listings active.`

    return (
        <Layout
            preview="Tomorrow your studio enters read-only. Nothing's deleted — but nothing new can happen, either."
            unsubscribeUrl={unsub}
            managePreferencesUrl={manage}
        >
            <SubjectLine>{subject}</SubjectLine>
            <Spacer />

            {/* Urgency banner */}
            <Section
                style={{
                    padding: '16px 18px',
                    backgroundColor: colors.warnBg,
                    border: `1px solid ${colors.warnBorder}`,
                    borderRadius: '10px',
                }}
            >
                <Row>
                    <Column style={{ width: '40px', verticalAlign: 'top' }}>
                        <Text
                            aria-hidden
                            style={{
                                margin: 0,
                                width: '28px',
                                height: '28px',
                                lineHeight: '28px',
                                textAlign: 'center',
                                borderRadius: '999px',
                                backgroundColor: colors.text,
                                color: colors.surface,
                                display: 'inline-block',
                            }}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ verticalAlign: 'middle' }}
                                aria-hidden
                            >
                                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </Text>
                    </Column>
                    <Column style={{ verticalAlign: 'top' }}>
                        <Text
                            style={{
                                margin: 0,
                                fontFamily: fonts.mono,
                                fontSize: '10px',
                                letterSpacing: '0.18em',
                                textTransform: 'uppercase',
                                color: colors.text,
                                lineHeight: 1.4,
                            }}
                        >
                            24 hours
                        </Text>
                        <Text
                            style={{
                                margin: '4px 0 0',
                                fontSize: '14px',
                                lineHeight: 1.55,
                                color: colors.text,
                            }}
                        >
                            Tomorrow at this time your studio enters read-only.{' '}
                            {listingCount} listings stay safe — but new reservations, edits, and
                            team logins pause until you pick a plan.
                        </Text>
                    </Column>
                </Row>
            </Section>
            <Spacer />

            <P>
                Pick the plan that matches what you&apos;ve been using. You can change it
                any time after — no contracts, no calls.
            </P>
            <Spacer />

            {PLAN_ROWS.map((p, i) => (
                <React.Fragment key={p.name}>
                    <PlanRowCard plan={p} />
                    {i < PLAN_ROWS.length - 1 && <Spacer height={8} />}
                </React.Fragment>
            ))}

            <Spacer />
            <Section>
                <EmailButton href={pricingAbs}>Pick a plan and keep going</EmailButton>
            </Section>
            <Spacer height={18} />
            <P small muted>
                Not ready? That&apos;s fine. Your data sits in read-only for 90 days — come
                back any time. Or reply and tell me what&apos;s missing; I read every one.
                <br />— Rongze
            </P>
        </Layout>
    )
}

export default OnboardingDay13

export const onboardingDay13Subject = (listingCount?: number) =>
    listingCount !== undefined
        ? `24 hours left in your trial. Pick a plan to keep ${listingCount} listings active.`
        : `24 hours left in your trial.`

export async function onboardingDay13Html(input: OnboardingDay13Props): Promise<string> {
    return render(<OnboardingDay13 {...input} />, { pretty: false })
}
