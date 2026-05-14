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

export interface OnboardingDay9Props {
    orgName: string
    pricingUrl: string
    siteUrl?: string
    unsubscribeUrl?: string
    managePreferencesUrl?: string
}

const DEFAULT_SITE_URL = 'https://lende.shipbyx.com'

const SUBJECT =
    'Loving lende? Pick a plan to keep your data and team going after day 14.'

interface Plan {
    name: string
    price: number
    blurb: string
    features: string[]
    recommended?: boolean
}

export const PLANS: Plan[] = [
    {
        name: 'Start',
        price: 19,
        blurb: 'Solo studio, up to 25 listings.',
        features: ['25 listings', '1 admin', 'Email support'],
    },
    {
        name: 'Grow',
        price: 49,
        blurb: 'Small team, full reservations + team roles.',
        features: ['Unlimited listings', '5 team seats', 'Priority support'],
        recommended: true,
    },
    {
        name: 'Scale',
        price: 129,
        blurb: 'Multiple locations, API + Smart Import.',
        features: ['Everything in Grow', 'API access', 'Smart Import'],
    },
]

export function TierCard({ plan }: { plan: Plan }) {
    const recommended = !!plan.recommended
    return (
        <Section
            style={{
                padding: '20px',
                borderRadius: '10px',
                border: `1px solid ${recommended ? colors.text : colors.border}`,
                backgroundColor: colors.surface,
                position: 'relative',
            }}
        >
            {recommended && (
                <Text
                    style={{
                        position: 'absolute',
                        top: '14px',
                        right: '14px',
                        margin: 0,
                        fontFamily: fonts.mono,
                        fontSize: '9px',
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: colors.surface,
                        backgroundColor: colors.text,
                        padding: '4px 8px',
                        borderRadius: '999px',
                        lineHeight: 1,
                        display: 'inline-block',
                    }}
                >
                    Recommended
                </Text>
            )}
            <Text
                style={{
                    margin: 0,
                    fontFamily: fonts.mono,
                    fontSize: '10px',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: colors.muted,
                    lineHeight: 1.4,
                }}
            >
                {plan.name}
            </Text>
            <Text
                style={{
                    margin: '12px 0 0',
                    fontSize: '32px',
                    fontWeight: 300,
                    lineHeight: 1,
                    color: colors.text,
                }}
            >
                ${plan.price}
                <span
                    style={{
                        fontSize: '12px',
                        fontWeight: 400,
                        color: colors.muted,
                        fontFamily: fonts.sans,
                        marginLeft: '6px',
                    }}
                >
                    / month
                </span>
            </Text>
            <Text
                style={{
                    margin: '12px 0 0',
                    fontSize: '12px',
                    lineHeight: 1.55,
                    color: colors.muted,
                }}
            >
                {plan.blurb}
            </Text>
            <Section
                style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: `1px solid ${colors.border}`,
                }}
            >
                {plan.features.map((f) => (
                    <Text
                        key={f}
                        style={{
                            margin: '0 0 6px',
                            fontSize: '12px',
                            color: colors.text,
                            lineHeight: 1.55,
                        }}
                    >
                        <span
                            aria-hidden
                            style={{
                                color: colors.text,
                                fontFamily: fonts.mono,
                                fontSize: '11px',
                                marginRight: '8px',
                            }}
                        >
                            —
                        </span>
                        {f}
                    </Text>
                ))}
            </Section>
        </Section>
    )
}

export const OnboardingDay9 = ({
    orgName: _orgName,
    pricingUrl,
    siteUrl = DEFAULT_SITE_URL,
    unsubscribeUrl,
    managePreferencesUrl,
}: OnboardingDay9Props) => {
    const pricingAbs = ensureAbsolute(pricingUrl, siteUrl)
    const unsub = unsubscribeUrl ?? buildUnsubscribeUrl(siteUrl)
    const manage = managePreferencesUrl ?? buildManagePreferencesUrl(siteUrl)

    return (
        <Layout
            preview="Three plans. The middle one fits most studios."
            unsubscribeUrl={unsub}
            managePreferencesUrl={manage}
        >
            <SubjectLine>{SUBJECT}</SubjectLine>
            <Spacer />
            <P>
                Day 14 is in 5 days. Pick a plan now and your data, listings, and team
                invitations carry over without a blink. Skip it and your studio enters
                read-only on day 15 — nothing is deleted, just paused.
            </P>
            <Spacer />
            <Section>
                <Row>
                    {PLANS.map((p) => (
                        <Column
                            key={p.name}
                            style={{ width: '33.33%', verticalAlign: 'top', padding: '0 4px' }}
                        >
                            <TierCard plan={p} />
                        </Column>
                    ))}
                </Row>
            </Section>
            <Spacer />
            <Section>
                <EmailButton href={pricingAbs}>Pick a plan</EmailButton>
            </Section>
            <Spacer height={18} />
            <P small muted>
                Not sure which fits? Reply to this email — I&apos;ll look at your usage and
                tell you straight, even if it&apos;s the cheapest one.
                <br />— Rongze
            </P>
        </Layout>
    )
}

export default OnboardingDay9

export const onboardingDay9Subject = () => SUBJECT

export async function onboardingDay9Html(input: OnboardingDay9Props): Promise<string> {
    return render(<OnboardingDay9 {...input} />, { pretty: false })
}
