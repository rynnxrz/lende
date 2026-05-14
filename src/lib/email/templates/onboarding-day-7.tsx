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

export type ListingKind = 'earrings' | 'bracelet' | 'ring' | 'necklace'

export interface OnboardingDay7Listing {
    name: string
    kind: ListingKind
}

export interface OnboardingDay7Props {
    orgName: string
    adminUrl: string
    listingCount: number
    reservationCount: number
    siteUrl?: string
    unsubscribeUrl?: string
    managePreferencesUrl?: string
    firstName?: string
    recentListings?: OnboardingDay7Listing[]
}

const DEFAULT_SITE_URL = 'https://lende.shipbyx.com'

const DEFAULT_RECENT: OnboardingDay7Listing[] = [
    { name: 'Aurelia drop earrings', kind: 'earrings' },
    { name: 'Étoile tennis bracelet', kind: 'bracelet' },
    { name: 'Marais signet ring', kind: 'ring' },
    { name: 'Vela chain necklace', kind: 'necklace' },
]

function ListingThumb({ kind, name }: { kind: ListingKind; name: string }) {
    const stroke = colors.text
    const common = {
        fill: 'none',
        stroke,
        strokeWidth: 1.1,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
    }
    const inner = (() => {
        if (kind === 'earrings') {
            return (
                <g {...common}>
                    <circle cx="16" cy="14" r="2" />
                    <circle cx="32" cy="14" r="2" />
                    <path d="M14 24 q2 6 2 12 q-4 -2 -6 -8 q1 -4 4 -4 z" />
                    <path d="M30 24 q2 6 2 12 q-4 -2 -6 -8 q1 -4 4 -4 z" />
                </g>
            )
        }
        if (kind === 'bracelet') {
            return (
                <g {...common}>
                    <ellipse cx="24" cy="24" rx="16" ry="9" />
                    <circle cx="10" cy="24" r="1.6" />
                    <circle cx="20" cy="16" r="1.6" />
                    <circle cx="30" cy="16" r="1.6" />
                    <circle cx="38" cy="24" r="1.6" />
                </g>
            )
        }
        if (kind === 'ring') {
            return (
                <g {...common}>
                    <circle cx="24" cy="30" r="10" />
                    <path d="M19 22 L24 14 L29 22 Z" />
                </g>
            )
        }
        // necklace
        return (
            <g {...common}>
                <path d="M10 12 q14 18 28 0" />
                <path d="M24 30 L24 36" />
                <path d="M20 36 L24 42 L28 36 Z" />
            </g>
        )
    })()

    const truncated = name.split(' ').slice(0, 2).join(' ')

    return (
        <Column style={{ width: '80px', paddingRight: '10px', verticalAlign: 'top' }}>
            <Text
                aria-label={name}
                style={{
                    margin: 0,
                    width: '64px',
                    height: '64px',
                    lineHeight: '64px',
                    textAlign: 'center',
                    borderRadius: '6px',
                    backgroundColor: colors.background,
                    border: `1px solid ${colors.border}`,
                }}
            >
                <svg
                    viewBox="0 0 48 48"
                    width="48"
                    height="48"
                    style={{ color: colors.text, verticalAlign: 'middle' }}
                    aria-hidden
                >
                    {inner}
                </svg>
            </Text>
            <Text
                style={{
                    margin: '6px 0 0',
                    fontSize: '10px',
                    color: colors.muted,
                    lineHeight: 1.35,
                    fontFamily: fonts.mono,
                    letterSpacing: '0.02em',
                }}
            >
                {truncated}
            </Text>
        </Column>
    )
}

function StatCallout({ label, value, sub }: { label: string; value: number; sub: string }) {
    return (
        <Column style={{ verticalAlign: 'top', padding: '0 6px' }}>
            <Section
                style={{
                    padding: '20px',
                    borderRadius: '10px',
                    border: `1px solid ${colors.border}`,
                    backgroundColor: colors.surface,
                }}
            >
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
                    {label}
                </Text>
                <Text
                    style={{
                        margin: '6px 0 0',
                        fontSize: '40px',
                        fontWeight: 300,
                        lineHeight: 1,
                        color: colors.text,
                    }}
                >
                    {value}
                </Text>
                <Text
                    style={{
                        margin: '6px 0 0',
                        fontSize: '12px',
                        color: colors.muted,
                        lineHeight: 1.5,
                    }}
                >
                    {sub}
                </Text>
            </Section>
        </Column>
    )
}

export const OnboardingDay7 = ({
    orgName: _orgName,
    adminUrl,
    listingCount,
    reservationCount,
    siteUrl = DEFAULT_SITE_URL,
    unsubscribeUrl,
    managePreferencesUrl,
    firstName = 'there',
    recentListings = DEFAULT_RECENT,
}: OnboardingDay7Props) => {
    const adminAbs = ensureAbsolute(adminUrl, siteUrl)
    const unsub = unsubscribeUrl ?? buildUnsubscribeUrl(siteUrl)
    const manage = managePreferencesUrl ?? buildManagePreferencesUrl(siteUrl)

    const subject = `You're halfway through your trial. Here's what you've built: ${listingCount} listings, ${reservationCount} reservations.`

    return (
        <Layout
            preview="Day 7 of 14. A snapshot of what's in your studio."
            unsubscribeUrl={unsub}
            managePreferencesUrl={manage}
        >
            <SubjectLine>{subject}</SubjectLine>
            <Spacer />
            <P>Halfway, {firstName}. Here&apos;s where your studio is right now:</P>
            <Spacer />
            <Section>
                <Row>
                    <StatCallout
                        label="Listings"
                        value={listingCount}
                        sub="Active in your inventory"
                    />
                    <StatCallout
                        label="Reservations"
                        value={reservationCount}
                        sub="Approved this period"
                    />
                </Row>
            </Section>
            <Spacer />
            <SectionLabel>Recent listings</SectionLabel>
            <Spacer height={14} />
            <Section>
                <Row>
                    {recentListings.slice(0, 4).map((l) => (
                        <ListingThumb key={l.name} kind={l.kind} name={l.name} />
                    ))}
                </Row>
            </Section>
            <Spacer />
            <P>
                You&apos;ve got 7 days left. The studios who finish their trial with at least
                10 listings and 5 approved reservations are the ones who stick — that&apos;s
                usually a 20-minute push from where you are now.
            </P>
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

export default OnboardingDay7

export const onboardingDay7Subject = (
    listingCount?: number,
    reservationCount?: number
) =>
    listingCount !== undefined && reservationCount !== undefined
        ? `You're halfway through your trial. Here's what you've built: ${listingCount} listings, ${reservationCount} reservations.`
        : `You're halfway through your trial.`

export async function onboardingDay7Html(input: OnboardingDay7Props): Promise<string> {
    return render(<OnboardingDay7 {...input} />, { pretty: false })
}
