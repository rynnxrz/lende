import { Resend } from 'resend'

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
 *        version + the in-code version stay in sync.
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

function buildResetEmailHtml(input: { resetUrl: string; recipientLabel?: string }) {
    const greeting = input.recipientLabel
        ? `Hi ${input.recipientLabel.split('@')[0]},`
        : 'Hi,'
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a; line-height: 1.6; margin: 0; padding: 24px; background: #f8fafc;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 22px;">Reset your lende password</h2>
    <p style="margin: 0 0 14px;">${greeting}</p>
    <p style="margin: 0 0 14px;">We received a request to reset the password for your lende account. Click the button below to choose a new password.</p>
    <p style="margin: 20px 0;">
      <a href="${input.resetUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 8px; background: #111827; color: #ffffff; text-decoration: none; font-weight: 600;">
        Reset password
      </a>
    </p>
    <p style="margin: 0 0 10px; font-size: 12px; color: #475569; word-break: break-all;">${input.resetUrl}</p>
    <p style="margin: 14px 0 6px; font-size: 13px; color: #475569;">This link expires in about one hour. After resetting, every existing session is signed out automatically.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 18px 0;" />
    <p style="margin: 0 0 6px; font-size: 12px; color: #64748b;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    <p style="margin: 0; font-size: 12px; color: #64748b;">如果不是你发起的请求，可以直接忽略此邮件，密码不会被更改。</p>
  </div>
</body>
</html>
  `
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
            html: buildResetEmailHtml({
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
