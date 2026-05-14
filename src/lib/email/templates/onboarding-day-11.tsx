import * as React from 'react'
import { render } from '@react-email/render'
import {
    Layout,
    SubjectLine,
    P,
    EmailButton,
    SectionLabel,
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
import { TierCard } from './onboarding-day-9'

export interface OnboardingDay11Props {
    orgName: string
    pricingUrl: string
    weekReservations?: number
    listings?: number
    teamSize?: number
    siteUrl?: string
    unsubscribeUrl?: string
    managePreferencesUrl?: string
    firstName?: string
}

const DEFAULT_SITE_URL = 'https://lende.shipbyx.com'

const SUBJECT = `Based on your usage, the Grow plan ($49) fits best — here's why.`

const GROW_PLAN = {
    name: 'Grow',
    price: 49,
    blurb: 'Small team, full reservations + team roles.',
    features: ['Unlimited listings', '5 team seats', 'Priority support'],
    recommended: true,
}

export const OnboardingDay11 = ({
    orgName: _orgName,
    pricingUrl,
    weekReservations = 12,
    listings = 18,
    teamSize = 3,
    siteUrl = DEFAULT_SITE_URL,
    unsubscribeUrl,
    managePreferencesUrl,
    firstName = 'there',
}: OnboardingDay11Props) => {
    const pricingAbs = ensureAbsolute(pricingUrl, siteUrl)
    const growUrl = `${pricingAbs}?plan=grow`
    const unsub = unsubscribeUrl ?? buildUnsubscribeUrl(siteUrl)
    const manage = managePreferencesUrl ?? buildManagePreferencesUrl(siteUrl)

    return (
        <Layout
            preview="A short, specific recommendation based on what you actually used this week."
            unsubscribeUrl={unsub}
            managePreferencesUrl={manage}
        >
            <SubjectLine>{SUBJECT}</SubjectLine>
            <Spacer />
            <P>{firstName}, I looked at your last 7 days. Here&apos;s the picture:</P>
            <Spacer />
            <Section
                style={{
                    padding: '24px',
                    borderRadius: '10px',
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.background,
                }}
            >
                <SectionLabel>Your usage · last 7 days</SectionLabel>
                <Spacer height={14} />
                <Row>
                    <Column style={{ width: '90px', verticalAlign: 'baseline' }}>
                        <Text
                            style={{
                                margin: 0,
                                fontSize: '44px',
                                fontWeight: 300,
                                lineHeight: 1,
                                color: colors.text,
                            }}
                        >
                            {weekReservations}
                        </Text>
                    </Column>
                    <Column style={{ verticalAlign: 'baseline' }}>
                        <Text
                            style={{
                                margin: 0,
                                fontSize: '13px',
                                color: colors.text,
                                lineHeight: 1.55,
                            }}
                        >
                            reservations created — that&apos;s past the{' '}
                            <span style={{ fontFamily: fonts.mono, fontSize: '12px' }}>Start</span>{' '}
                            plan&apos;s monthly cap on day 7.
                        </Text>
                    </Column>
                </Row>
                <Spacer height={10} />
                <Row>
                    <Column style={{ width: '90px', verticalAlign: 'baseline' }}>
                        <Text
                            style={{
                                margin: 0,
                                fontSize: '20px',
                                fontWeight: 400,
                                lineHeight: 1,
                                color: colors.text,
                            }}
                        >
                            {listings}
                        </Text>
                    </Column>
                    <Column style={{ verticalAlign: 'baseline' }}>
                        <Text
                            style={{
                                margin: 0,
                                fontSize: '13px',
                                color: colors.muted,
                                lineHeight: 1.55,
                            }}
                        >
                            listings active in your inventory.
                        </Text>
                    </Column>
                </Row>
                <Spacer height={10} />
                <Row>
                    <Column style={{ width: '90px', verticalAlign: 'baseline' }}>
                        <Text
                            style={{
                                margin: 0,
                                fontSize: '20px',
                                fontWeight: 400,
                                lineHeight: 1,
                                color: colors.text,
                            }}
                        >
                            {teamSize}
                        </Text>
                    </Column>
                    <Column style={{ verticalAlign: 'baseline' }}>
                        <Text
                            style={{
                                margin: 0,
                                fontSize: '13px',
                                color: colors.muted,
                                lineHeight: 1.55,
                            }}
                        >
                            team members invited — Start tops out at 1.
                        </Text>
                    </Column>
                </Row>
            </Section>
            <Spacer />
            <P>
                You&apos;re not at Scale yet — you don&apos;t need the API or Smart Import.
                But you&apos;re past Start. Grow at $49/month is the honest fit.
            </P>
            <Spacer />
            <TierCard plan={GROW_PLAN} />
            <Spacer />
            <Section>
                <Row>
                    <Column style={{ width: '50%', verticalAlign: 'middle', paddingRight: '6px' }}>
                        <EmailButton href={growUrl}>Choose Grow · $49/mo</EmailButton>
                    </Column>
                    <Column style={{ width: '50%', verticalAlign: 'middle', paddingLeft: '6px' }}>
                        <EmailButton href={pricingAbs} tone="ghost">
                            See all plans
                        </EmailButton>
                    </Column>
                </Row>
            </Section>
            <Spacer height={18} />
            <P small muted>
                If your shape of usage changes in 30 days, downgrade or upgrade with one
                click. No call required.
                <br />— Rongze
            </P>
        </Layout>
    )
}

export default OnboardingDay11

export const onboardingDay11Subject = () => SUBJECT

export async function onboardingDay11Html(input: OnboardingDay11Props): Promise<string> {
    return render(<OnboardingDay11 {...input} />, { pretty: false })
}
