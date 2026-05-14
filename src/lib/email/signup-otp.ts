import { Resend } from 'resend'

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

function buildOtpEmailHtml(input: { code: string; expiresInMin: number }) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a; line-height: 1.6; margin: 0; padding: 24px; background: #f8fafc;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center;">
    <h2 style="margin: 0 0 8px; font-size: 20px;">Your lende verification code</h2>
    <p style="margin: 0 0 24px; font-size: 14px; color: #64748b;">
      Enter this code in your browser to continue setting up your workspace.
    </p>
    <div style="margin: 24px auto; padding: 16px 20px; display: inline-block; background: #f1f5f9; border-radius: 10px; font-size: 32px; font-weight: 600; letter-spacing: 0.4em; color: #0f172a;">
      ${input.code}
    </div>
    <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">
      Expires in ${input.expiresInMin} minutes.
    </p>
    <p style="margin: 12px 0 0; font-size: 12px; color: #94a3b8;">
      If you did not request this, ignore this email — no account was created.
    </p>
  </div>
</body>
</html>
  `
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
            html: buildOtpEmailHtml({ code: input.code, expiresInMin }),
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
