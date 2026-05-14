import * as React from 'react'
import {
    Body,
    Column,
    Container,
    Head,
    Hr,
    Html,
    Link,
    Preview,
    Row,
    Section,
    Text,
} from '@react-email/components'

/**
 * Design tokens — sourced verbatim from email-shared.jsx (Claude Design handoff
 * `Landing v1 — Structure`). The original uses oklch() for color-space
 * accuracy; we keep hex equivalents so legacy email clients (Outlook desktop,
 * Yahoo) don't strip the value.
 *
 * source: tracker/brief-46-handoff/project/email-shared.jsx
 */
export const colors = {
    // EM_BG — page surround, soft cool gray
    background: '#f1f4f9', // ≈ oklch(0.968 0.007 247.896)
    // EM_CARD — email body bg, pure white
    surface: '#ffffff', // = oklch(1 0 0)
    // EM_FG — primary text, near-black with cool tint
    text: '#1f2937', // ≈ oklch(0.208 0.042 265.755)
    // EM_MUTED — muted text, mid gray
    muted: '#6b7280', // ≈ oklch(0.554 0.046 257.417)
    // EM_BORDER — soft border
    border: '#e5e7eb', // ≈ oklch(0.929 0.013 255.508)
    // EM_BORDER_STRONG — emphasized border (e.g. ghost button)
    borderStrong: '#cbd5e1', // ≈ oklch(0.869 0.022 252.894)
    // EM_WARN_BG / EM_WARN_BORDER — subtle amber, no emoji
    warnBg: '#faf6ec', // ≈ oklch(0.97 0.025 75)
    warnBorder: '#dac9a3', // ≈ oklch(0.85 0.05 75)
} as const

export const fonts = {
    sans: "'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const

export const ADDRESS_LINE = 'ShipByX Ltd · Auckland, NZ'
export const FROM_ADDRESS = 'notifications@shipbyx.com'
export const REPLY_TO = 'founder@shipbyx.com'

interface LayoutProps {
    preview: string
    children: React.ReactNode
    unsubscribeUrl?: string
    managePreferencesUrl?: string
}

/**
 * Outer email shell — bordered card on a tinted page background.
 * Mirrors `EmailShell` from email-shared.jsx.
 */
export function Layout({
    preview,
    children,
    unsubscribeUrl,
    managePreferencesUrl,
}: LayoutProps) {
    return (
        <Html>
            <Head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <meta name="x-apple-disable-message-reformatting" />
            </Head>
            <Preview>{preview}</Preview>
            <Body
                style={{
                    backgroundColor: colors.background,
                    color: colors.text,
                    fontFamily: fonts.sans,
                    margin: 0,
                    padding: '32px 12px',
                }}
            >
                <Container
                    style={{
                        maxWidth: '600px',
                        width: '100%',
                        margin: '0 auto',
                        backgroundColor: colors.surface,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '10px',
                        overflow: 'hidden',
                    }}
                >
                    <EmailHeader preview={preview} />
                    <Section style={{ padding: '28px' }}>{children}</Section>
                    <EmailFooter
                        unsubscribeUrl={unsubscribeUrl}
                        managePreferencesUrl={managePreferencesUrl}
                    />
                </Container>
            </Body>
        </Html>
    )
}

/**
 * Top header bar — small lende logo, From/Reply-to mono grid, italic preheader.
 * Mirrors `EmailHeader` from email-shared.jsx.
 */
function EmailHeader({ preview }: { preview: string }) {
    return (
        <Section
            style={{
                padding: '20px 28px 18px',
                borderBottom: `1px solid ${colors.border}`,
                backgroundColor: colors.surface,
            }}
        >
            <BrandLockup size="sm" />
            <Section style={{ marginTop: '14px' }}>
                <Row>
                    <Column style={{ width: '70px', verticalAlign: 'top' }}>
                        <Text
                            style={{
                                margin: 0,
                                fontFamily: fonts.mono,
                                fontSize: '11px',
                                letterSpacing: '0.04em',
                                color: colors.muted,
                                lineHeight: 1.6,
                            }}
                        >
                            From
                            <br />
                            Reply-to
                        </Text>
                    </Column>
                    <Column style={{ verticalAlign: 'top' }}>
                        <Text
                            style={{
                                margin: 0,
                                fontFamily: fonts.mono,
                                fontSize: '11px',
                                letterSpacing: '0.04em',
                                color: colors.muted,
                                lineHeight: 1.6,
                            }}
                        >
                            <span style={{ color: colors.text }}>{FROM_ADDRESS}</span>
                            <br />
                            {REPLY_TO}
                        </Text>
                    </Column>
                </Row>
            </Section>
            <Text
                style={{
                    margin: '14px 0 0',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: colors.muted,
                    fontStyle: 'italic',
                }}
            >
                {preview}
            </Text>
        </Section>
    )
}

interface BrandLockupProps {
    size?: 'sm' | 'xs'
}

function BrandLockup({ size = 'sm' }: BrandLockupProps) {
    const fontSize = size === 'xs' ? '12px' : '13px'
    const dot = size === 'xs' ? 7 : 8
    return (
        <Text
            style={{
                margin: 0,
                fontWeight: 500,
                fontSize,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: colors.text,
                lineHeight: 1,
            }}
        >
            <span
                aria-hidden
                style={{
                    width: `${dot}px`,
                    height: `${dot}px`,
                    borderRadius: '2px',
                    backgroundColor: colors.text,
                    display: 'inline-block',
                    marginRight: '10px',
                    verticalAlign: 'middle',
                }}
            />
            <span style={{ verticalAlign: 'middle' }}>lende</span>
        </Text>
    )
}

interface FooterProps {
    unsubscribeUrl?: string
    managePreferencesUrl?: string
}

/**
 * Bottom footer — logo, ShipByX address + unsubscribe + manage preferences row,
 * reassurance line. Mirrors `EmailFooter` from email-shared.jsx.
 */
function EmailFooter({ unsubscribeUrl, managePreferencesUrl }: FooterProps = {}) {
    const unsub = unsubscribeUrl ?? '#'
    const manage = managePreferencesUrl ?? '#'
    const linkStyle = {
        color: colors.muted,
        textDecoration: 'underline',
        textUnderlineOffset: '3px' as const,
    }
    return (
        <Section
            style={{
                padding: '24px 28px 28px',
                borderTop: `1px solid ${colors.border}`,
                backgroundColor: colors.surface,
            }}
        >
            <BrandLockup size="xs" />
            <Text
                style={{
                    margin: '14px 0 0',
                    fontSize: '11px',
                    lineHeight: 1.55,
                    color: colors.muted,
                }}
            >
                ShipByX Ltd <span aria-hidden>·</span> Auckland, NZ{' '}
                <span aria-hidden>·</span>{' '}
                <Link href={unsub} style={linkStyle}>
                    Unsubscribe
                </Link>{' '}
                <span aria-hidden>·</span>{' '}
                <Link href={manage} style={linkStyle}>
                    Manage preferences
                </Link>
            </Text>
            <Text
                style={{
                    margin: '14px 0 0',
                    fontSize: '11px',
                    lineHeight: 1.55,
                    color: colors.muted,
                }}
            >
                You&apos;re receiving this because you accepted an invitation to lende. If that
                wasn&apos;t you, reply to this email and we&apos;ll sort it out.
            </Text>
        </Section>
    )
}

/**
 * Subject line rendered as the body's H1 — light weight, near-paragraph styling.
 */
export function SubjectLine({ children }: { children: React.ReactNode }) {
    return (
        <Text
            style={{
                margin: 0,
                fontWeight: 400,
                fontSize: '20px',
                lineHeight: 1.35,
                letterSpacing: '0.005em',
                color: colors.text,
            }}
        >
            {children}
        </Text>
    )
}

/**
 * Body paragraph — 15px reading size, comfortable line height.
 */
interface PProps {
    children: React.ReactNode
    muted?: boolean
    small?: boolean
    style?: React.CSSProperties
}

export function P({ children, muted, small, style }: PProps) {
    return (
        <Text
            style={{
                margin: 0,
                fontSize: small ? '13px' : '15px',
                lineHeight: 1.6,
                color: muted ? colors.muted : colors.text,
                ...style,
            }}
        >
            {children}
        </Text>
    )
}

/**
 * Vertical spacer — replaces parent flex-gap so client compatibility holds.
 */
export function Spacer({ height = 22 }: { height?: number }) {
    return <Section style={{ height: `${height}px`, lineHeight: '1px' }} aria-hidden>&nbsp;</Section>
}

/**
 * Primary / ghost button — inline-block anchor. Tone="ghost" = transparent bg
 * with strong border (matches EmailButton tone="primary"|"ghost").
 */
interface EmailButtonProps {
    href: string
    tone?: 'primary' | 'ghost'
    children: React.ReactNode
}

export function EmailButton({ href, tone = 'primary', children }: EmailButtonProps) {
    const primary = tone === 'primary'
    return (
        <Link
            href={href}
            style={{
                display: 'inline-block',
                padding: '14px 22px',
                borderRadius: '8px',
                backgroundColor: primary ? colors.text : 'transparent',
                color: primary ? colors.surface : colors.text,
                border: `1px solid ${primary ? colors.text : colors.borderStrong}`,
                fontSize: '14px',
                fontWeight: 500,
                letterSpacing: '0.02em',
                textDecoration: 'none',
                lineHeight: 1,
            }}
        >
            {children}
        </Link>
    )
}

/**
 * Section label — small mono caps with leading dot.
 * Mirrors `SectionLabel` from email-shared.jsx.
 */
export function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
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
            <span
                aria-hidden
                style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '999px',
                    backgroundColor: colors.text,
                    display: 'inline-block',
                    marginRight: '10px',
                    verticalAlign: 'middle',
                }}
            />
            <span style={{ verticalAlign: 'middle' }}>{children}</span>
        </Text>
    )
}

/**
 * Founder sign-off block — separated by hairline border, muted small text.
 * Used by Day 0 ("hit reply with anything") and Day 11/13 ("not ready? reply").
 */
export function FounderNote({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Spacer height={4} />
            <Hr
                style={{
                    border: 'none',
                    borderTop: `1px solid ${colors.border}`,
                    margin: 0,
                }}
            />
            <Spacer height={18} />
            <Text
                style={{
                    margin: 0,
                    fontSize: '13px',
                    lineHeight: 1.6,
                    color: colors.muted,
                }}
            >
                {children}
            </Text>
        </>
    )
}

export function buildUnsubscribeUrl(siteUrl: string, token?: string): string {
    const base = siteUrl.replace(/\/$/, '')
    return token
        ? `${base}/unsubscribe?token=${encodeURIComponent(token)}`
        : `${base}/unsubscribe`
}

export function buildManagePreferencesUrl(siteUrl: string, token?: string): string {
    const base = siteUrl.replace(/\/$/, '')
    return token
        ? `${base}/email-preferences?token=${encodeURIComponent(token)}`
        : `${base}/email-preferences`
}

export function ensureAbsolute(url: string, siteUrl: string): string {
    if (/^https?:\/\//.test(url)) return url
    const base = siteUrl.replace(/\/$/, '')
    return `${base}${url.startsWith('/') ? url : `/${url}`}`
}

// Re-export commonly-used react-email primitives so templates don't all
// import from two places.
export { Section, Row, Column, Link, Text } from '@react-email/components'
