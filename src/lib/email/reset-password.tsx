import * as React from 'react'
import { render } from '@react-email/render'
import { Resend } from 'resend'
import { Layout, SubjectLine, P, EmailButton, Spacer, colors } from './templates/_shared'

/**
 * BRIEF-59 — reset-password notification helper.
 *
 * Note on usage:
 *   The forgot-password flow itself uses Supabase's
 *   `auth.resetPasswordForEmail`, which already sends an email
 *   through the configured SMTP provider (Resend, per BRIEF-37). The
 *   template body is configured in the Supabase Dashboard → Auth →
 *   Email Templates → "Reset Password".
 *
 *   This module is a *fallback / mirror* used in two places:
 *     1. Operations may want to send a reset link out-of-band (e.g.
 *        from a support tool); calling this function does that.
 *     2. As a reference template — its body matches what we ask
 *        Rongze to paste into the Supabase template, so the on-file
 *        version + the in-code version stay in sync (modulo the
 *        Go-template `{{ .TokenHash }}` link, which only the dashboard
 *        version uses).
 *
 *   The email follows the BRIEF-59 risk-#2 mitigation rules:
 *     - bilingual "if you didn't request this, ignore" footer (EN +
 *       中文 — the lende user base is mixed),
 *     - one-hour expiry stated in the body,
 *     - single visible CTA + plaintext fallback URL.
 */

const getResendClient = () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return null
    return new Resend(apiKey)
}

interface ResetPasswordEmailProps {
    resetUrl: string
    recipientLabel?: string
}

function ResetPasswordEmail({ resetUrl, recipientLabel }: ResetPasswordEmailProps) {
    const greeting = recipientLabel ? `Hi ${recipientLabel.split('@')[0]},` : 'Hi,'
    return (
        <Layout
            preview="Reset your lende password"
            footerNote="This is a security email about your lende account. If you have questions, reply to this email."
        >
            <SubjectLine>Reset your password</SubjectLine>
            <Spacer />
            <P>{greeting}</P>
            <Spacer height={10} />
            <P>
                We received a request to reset the password for your lende account. Click
                the button below to choose a new password.
            </P>
            <Spacer />
            <EmailButton href={resetUrl}>Reset password</EmailButton>
            <Spacer />
            <P small muted style={{ wordBreak: 'break-all' }}>
                {resetUrl}
            </P>
            <Spacer height={14} />
            <P small muted>
                This link expires in about one hour. After resetting, every existing
                session is signed out automatically.
            </P>
            <Spacer height={10} />
            <P small muted style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '14px' }}>
                If you didn&apos;t request this, you can safely ignore this email — your
                password won&apos;t change.
                <br />
                如果不是你发起的请求，可以直接忽略此邮件，密码不会被更改。
            </P>
        </Layout>
    )
}

async function buildResetEmailHtml(input: { resetUrl: string; recipientLabel?: string }) {
    return render(
        <ResetPasswordEmail resetUrl={input.resetUrl} recipientLabel={input.recipientLabel} />,
        { pretty: false },
    )
}

export async function sendResetPasswordEmail(input: {
    toEmail: string
    resetUrl: string
}): Promise<{ success: true } | { success: false; error: string }> {
    const resend = getResendClient()
    if (!resend) {
        return { success: false, error: 'RESEND_API_KEY is not configured.' }
    }

    try {
        const { error } = await resend.emails.send({
            from: 'lende <notifications@shipbyx.com>',
            replyTo: 'founder@shipbyx.com',
            to: [input.toEmail],
            subject: 'Reset your lende password',
            html: await buildResetEmailHtml({
                resetUrl: input.resetUrl,
                recipientLabel: input.toEmail,
            }),
            tags: [{ name: 'category', value: 'reset_password' }],
        })

        if (error) {
            return { success: false, error: error.message || 'Failed to send reset email.' }
        }

        return { success: true }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
