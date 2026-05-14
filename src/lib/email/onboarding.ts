import { Resend } from 'resend'
import * as React from 'react'
import {
    OnboardingDay0,
    onboardingDay0Subject,
} from './templates/onboarding-day-0'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://lende.shipbyx.com'

const getResendClient = () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return null
    return new Resend(apiKey)
}

interface SendOnboardingDay0Input {
    toEmail: string
    orgName: string
    adminUrl: string
    firstName?: string
}

export async function sendOnboardingDay0(input: SendOnboardingDay0Input): Promise<void> {
    const resend = getResendClient()
    if (!resend) return

    const recipient = process.env.RESEND_TEST_INBOX || input.toEmail

    try {
        await resend.emails.send({
            from: 'lende <notifications@shipbyx.com>',
            replyTo: 'founder@shipbyx.com',
            to: [recipient],
            subject: onboardingDay0Subject(input.orgName),
            react: React.createElement(OnboardingDay0, {
                orgName: input.orgName,
                adminUrl: input.adminUrl,
                siteUrl: SITE_URL,
                firstName: input.firstName,
            }),
            tags: [{ name: 'onboarding-day', value: '0' }],
        })
    } catch (err) {
        console.error('[sendOnboardingDay0] send failed', err)
    }
}
