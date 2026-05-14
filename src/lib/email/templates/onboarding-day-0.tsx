import * as React from 'react'
import { render } from '@react-email/render'
import {
    Layout,
    SubjectLine,
    P,
    EmailButton,
    FounderNote,
    Spacer,
    Section,
    colors,
    fonts,
    buildUnsubscribeUrl,
    buildManagePreferencesUrl,
    ensureAbsolute,
} from './_shared'

export interface OnboardingDay0Props {
    orgName: string
    adminUrl: string
    siteUrl?: string
    unsubscribeUrl?: string
    managePreferencesUrl?: string
    walkthroughUrl?: string
    firstName?: string
}

const DEFAULT_SITE_URL = 'https://lende.shipbyx.com'
const DEFAULT_WALKTHROUGH_PATH = '/welcome/walkthrough'

const SUBJECT =
    "Welcome. Here's how Ivy creates her first reservation in lende — 4 minutes."

/**
 * Hero video thumbnail — abstract single-color line art of a jewelry studio
 * with a play button overlay + duration chip. Matches EmailDay0.jsx.
 *
 * SVG inline = renders in Gmail web/iOS, Apple Mail, Yahoo. Outlook desktop
 * may not render <svg> — degrades gracefully to the bordered box + play
 * button (which is built from inline-block divs with text content).
 */
function HeroVideoCard({ href }: { href: string }) {
    return (
        <Section
            style={{
                position: 'relative',
                borderRadius: '10px',
                overflow: 'hidden',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.background,
                backgroundImage: `repeating-linear-gradient(135deg, ${colors.background} 0 16px, ${colors.surface} 16px 32px)`,
                height: '300px',
            }}
        >
            <a
                href={href}
                aria-label="Watch the walkthrough"
                style={{ display: 'block', position: 'relative', height: '300px' }}
            >
                <svg
                    viewBox="0 0 600 376"
                    preserveAspectRatio="xMidYMid slice"
                    width="100%"
                    height="100%"
                    aria-hidden
                    style={{
                        display: 'block',
                        color: colors.text,
                        opacity: 0.55,
                        position: 'absolute',
                        inset: 0,
                    }}
                >
                    <line x1="0" y1="240" x2="600" y2="240" stroke="currentColor" strokeWidth="1" />
                    <rect x="60" y="240" width="480" height="100" fill="none" stroke="currentColor" strokeWidth="1" />
                    <path
                        d="M120 80 L120 150 Q120 180 160 200"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                    />
                    <circle cx="160" cy="200" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    <rect x="220" y="260" width="200" height="60" rx="3" fill="none" stroke="currentColor" strokeWidth="1" />
                    <circle cx="250" cy="290" r="6" fill="none" stroke="currentColor" strokeWidth="1" />
                    <circle cx="290" cy="290" r="6" fill="none" stroke="currentColor" strokeWidth="1" />
                    <path
                        d="M330 282 L340 296 L350 282 L340 320 Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                    />
                    <ellipse cx="390" cy="292" rx="14" ry="6" fill="none" stroke="currentColor" strokeWidth="1" />
                    <path
                        d="M460 90 Q470 110 460 130 Q450 150 460 170"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                    />
                    <line x1="40" y1="120" x2="200" y2="120" stroke="currentColor" strokeWidth="1" />
                    <line x1="40" y1="170" x2="200" y2="170" stroke="currentColor" strokeWidth="1" />
                </svg>
                <span
                    aria-hidden
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '64px',
                        height: '64px',
                        borderRadius: '999px',
                        backgroundColor: colors.text,
                        color: colors.surface,
                        display: 'inline-block',
                        textAlign: 'center',
                        lineHeight: '64px',
                        fontSize: '22px',
                        paddingLeft: '4px',
                        boxSizing: 'border-box',
                    }}
                >
                    ▶
                </span>
                <span
                    style={{
                        position: 'absolute',
                        bottom: '12px',
                        right: '12px',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        backgroundColor: colors.text,
                        color: colors.surface,
                        fontFamily: fonts.mono,
                        fontSize: '10px',
                        letterSpacing: '0.08em',
                        lineHeight: 1,
                    }}
                >
                    4:08
                </span>
            </a>
        </Section>
    )
}

export const OnboardingDay0 = ({
    orgName,
    adminUrl,
    siteUrl = DEFAULT_SITE_URL,
    unsubscribeUrl,
    managePreferencesUrl,
    walkthroughUrl,
    firstName = 'there',
}: OnboardingDay0Props) => {
    const adminAbs = ensureAbsolute(adminUrl, siteUrl)
    const walkthroughAbs = walkthroughUrl
        ? ensureAbsolute(walkthroughUrl, siteUrl)
        : ensureAbsolute(DEFAULT_WALKTHROUGH_PATH, siteUrl)
    const unsub = unsubscribeUrl ?? buildUnsubscribeUrl(siteUrl)
    const manage = managePreferencesUrl ?? buildManagePreferencesUrl(siteUrl)

    return (
        <Layout
            preview="A 4-minute walkthrough from a real lende studio. Optional, but worth it."
            unsubscribeUrl={unsub}
            managePreferencesUrl={manage}
        >
            <SubjectLine>{SUBJECT}</SubjectLine>
            <Spacer />
            <HeroVideoCard href={walkthroughAbs} />
            <Spacer />
            <P>
                Welcome, {firstName}. I asked Ivy — one of the studios who&apos;s been on{' '}
                <strong>{orgName === 'lende' ? 'lende' : 'lende'}</strong>
                {' '}the longest — to record exactly how she takes a customer rental from
                request to pickup. No edits, no script. It&apos;s the fastest way to see
                what your week looks like with lende.
            </P>
            <Spacer />
            <Section>
                <EmailButton href={walkthroughAbs}>Watch the walkthrough</EmailButton>
            </Section>
            <Spacer height={18} />
            <P small muted>
                Or just sign in and try it on{' '}
                <a
                    href={adminAbs}
                    style={{
                        color: colors.text,
                        textDecoration: 'underline',
                        textUnderlineOffset: '3px',
                    }}
                >
                    your sample data
                </a>
                {' '}— you&apos;ll be done in about the same time.
            </P>

            <FounderNote>
                Hit reply with anything — questions, bug reports, &ldquo;this is broken on
                Safari&rdquo;. Replies come straight to me.
                <br />
                — Rongze, founder
            </FounderNote>
        </Layout>
    )
}

export default OnboardingDay0

export const onboardingDay0Subject = (_orgName?: string) => SUBJECT

export async function onboardingDay0Html(input: OnboardingDay0Props): Promise<string> {
    return render(<OnboardingDay0 {...input} />, { pretty: false })
}
