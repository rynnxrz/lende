import * as React from 'react'
import { render } from '@react-email/render'
import {
    Layout,
    SubjectLine,
    P,
    Spacer,
    colors,
    buildUnsubscribeUrl,
    buildManagePreferencesUrl,
    ensureAbsolute,
    Text,
} from './_shared'
import { Hr } from '@react-email/components'

export interface OnboardingDay1Props {
    orgName: string
    adminUrl: string
    siteUrl?: string
    unsubscribeUrl?: string
    managePreferencesUrl?: string
    bookingUrl?: string
    firstName?: string
}

const DEFAULT_SITE_URL = 'https://lende.shipbyx.com'
const DEFAULT_BOOKING_URL = 'https://cal.com/rongze/lende-onboarding-20'

const SUBJECT =
    "Notice you haven't created a reservation yet. Want me to walk you through it?"

export const OnboardingDay1 = ({
    orgName: _orgName,
    adminUrl,
    siteUrl = DEFAULT_SITE_URL,
    unsubscribeUrl,
    managePreferencesUrl,
    bookingUrl,
    firstName = 'there',
}: OnboardingDay1Props) => {
    const _adminAbs = ensureAbsolute(adminUrl, siteUrl)
    const bookingAbs = bookingUrl
        ? ensureAbsolute(bookingUrl, siteUrl)
        : DEFAULT_BOOKING_URL
    const unsub = unsubscribeUrl ?? buildUnsubscribeUrl(siteUrl)
    const manage = managePreferencesUrl ?? buildManagePreferencesUrl(siteUrl)

    const inlineLinkStyle = {
        color: colors.text,
        textDecoration: 'underline' as const,
        textUnderlineOffset: '3px',
        textDecorationColor: colors.borderStrong,
    }

    return (
        <Layout
            preview="No template. Just a quick note from me — Rongze."
            unsubscribeUrl={unsub}
            managePreferencesUrl={manage}
        >
            <SubjectLine>{SUBJECT}</SubjectLine>
            <Spacer />
            <P>{firstName},</P>
            <Spacer height={18} />
            <P>
                I run lende, and I look at the new-studio dashboard most mornings. I noticed
                you signed in but haven&apos;t created your first reservation yet — that&apos;s
                the one moment where lende either clicks for you or doesn&apos;t.
            </P>
            <Spacer height={18} />
            <P>
                If something&apos;s getting in the way — sample data felt off, the form
                didn&apos;t match how you actually rent, you hit a bug — just hit reply and
                tell me. It comes to my inbox. No bot.
            </P>
            <Spacer height={18} />
            <P>
                If it&apos;d be easier to walk through it together, I keep four 20-minute
                slots a week for studios in their first two weeks. Pick one{' '}
                <a href={bookingAbs} style={inlineLinkStyle}>
                    here
                </a>{' '}
                and I&apos;ll be there.
            </P>
            <Spacer height={18} />
            <P>Either way — glad you&apos;re trying it out.</P>
            <Spacer height={6} />
            <P>— Rongze</P>

            <Spacer height={14} />
            <Hr
                style={{ border: 'none', borderTop: `1px solid ${colors.border}`, margin: 0 }}
            />
            <Spacer height={14} />
            <Text
                style={{
                    margin: 0,
                    fontSize: '12px',
                    color: colors.muted,
                    lineHeight: 1.55,
                }}
            >
                Rongze · founder, lende
                <br />
                founder@shipbyx.com
            </Text>
        </Layout>
    )
}

export default OnboardingDay1

export const onboardingDay1Subject = () => SUBJECT

export async function onboardingDay1Html(input: OnboardingDay1Props): Promise<string> {
    return render(<OnboardingDay1 {...input} />, { pretty: false })
}
