import * as React from 'react'
import { render } from '@react-email/render'
import { Resend } from 'resend'
import { Layout, SubjectLine, P, Spacer, Section, colors, fonts } from './templates/_shared'

/**
 * BRIEF-60 — fallback OTP email template + sender.
 *
 * IMPORTANT: this is a *fallback* path — the primary OTP email is
 * Supabase's built-in template, configured in the Supabase Auth
 * dashboard (Project Settings → Auth → Email Templates → "Magic Link"
 * / "OTP"). When `requestSignupOtpAction` calls `signInWithOtp`,
 * Supabase generates the 6-digit code itself and sends it through the
 * configured SMTP provider (Resend). This module exists so we can
 * send a code outside the Supabase flow if needed (e.g. for a future
 * "Send via different channel" feature).
 *
 * Per BRIEF-60 §step 2: "实际 Supabase 已配 Resend SMTP, OTP 用 Supabase
 * 默认 template **优先**". This file is a code-level placeholder /
 * reusable wrapper — it is NOT called by the OTP signup flow.
 *
 * Usage (future):
 *   import { sendSignupOtpEmail } from '@/lib/email/signup-otp'
 *   await sendSignupOtpEmail({ toEmail: ..., code: '123456', expiresInMin: 5 })
 */

const getResendClient = () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return null
    return new Resend(apiKey)
}

export interface SignupOtpInput {
    toEmail: string
    /** 6-digit numeric code. */
    code: string
    /** Minutes until expiry (default 5). */
    expiresInMin?: number
}

interface SignupOtpEmailProps {
    code: string
    expiresInMin: number
}

function SignupOtpEmail({ code, expiresInMin }: SignupOtpEmailProps) {
    return (
        <Layout
            preview={`Your lende verification code: ${code}`}
            footerNote="This is an automated message from lende. If you have questions, reply to this email."
        >
            <SubjectLine>Your verification code</SubjectLine>
            <Spacer />
            <P muted>Enter this code in your browser to continue setting up your workspace.</P>
            <Spacer />
            <Section
                style={{
                    textAlign: 'center',
                    padding: '18px 0',
                    backgroundColor: colors.background,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                }}
            >
                <span
                    style={{
                        fontFamily: fonts.mono,
                        fontSize: '32px',
                        fontWeight: 500,
                        letterSpacing: '0.4em',
                        color: colors.text,
                    }}
                >
                    {code}
                </span>
            </Section>
            <Spacer />
            <P small muted>Expires in {expiresInMin} minutes.</P>
            <Spacer height={6} />
            <P small muted>
                If you did not request this, ignore this email — no account was created.
            </P>
        </Layout>
    )
}

async function buildOtpEmailHtml(input: { code: string; expiresInMin: number }) {
    return render(<SignupOtpEmail code={input.code} expiresInMin={input.expiresInMin} />, {
        pretty: false,
    })
}

export async function sendSignupOtpEmail(
    input: SignupOtpInput,
): Promise<{ success: true } | { success: false; error: string }> {
    const resend = getResendClient()
    if (!resend) {
        return { success: false, error: 'RESEND_API_KEY is not configured.' }
    }

    if (!/^\d{6}$/.test(input.code)) {
        return { success: false, error: 'OTP code must be exactly 6 digits.' }
    }

    const expiresInMin = input.expiresInMin ?? 5
    const from = process.env.RESEND_FROM_EMAIL || 'lende <onboarding@lende.shipbyx.com>'

    try {
        const { error } = await resend.emails.send({
            from,
            to: input.toEmail,
            subject: `Your lende verification code: ${input.code}`,
            html: await buildOtpEmailHtml({ code: input.code, expiresInMin }),
        })
        if (error) {
            return { success: false, error: error.message ?? 'Resend error.' }
        }
        return { success: true }
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown email send error.'
        return { success: false, error: message }
    }
}
