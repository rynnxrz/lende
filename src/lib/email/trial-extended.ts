import { Resend } from 'resend'

/**
 * BRIEF-61 — when Rongze clicks "Extend trial 7d" in /system-admin/orgs,
 * notify the org owner that their trial was extended.
 *
 * Uses Resend transactional (NOT founder mailto) — this is a system
 * notification, not a personal touch. For personal emails see the
 * "Send personal email" modal which uses mailto: from Rongze's own
 * inbox.
 */

const getResendClient = () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return null
    return new Resend(apiKey)
}

function buildTrialExtendedHtml(input: {
    orgName: string
    orgSlug: string
    ownerName: string | null
    days: number
    newTrialEndsAt: string
    siteUrl: string
}) {
    const greeting = input.ownerName
        ? `Hi ${input.ownerName.split(' ')[0]},`
        : 'Hi,'
    const niceDate = (() => {
        try {
            const d = new Date(input.newTrialEndsAt)
            return d.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            })
        } catch {
            return input.newTrialEndsAt
        }
    })()
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a; line-height: 1.6; margin: 0; padding: 24px; background: #f8fafc;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 22px;">Your trial was extended by ${input.days} days</h2>
    <p style="margin: 0 0 14px;">${greeting}</p>
    <p style="margin: 0 0 14px;">We've extended the lende trial for <strong>${input.orgName}</strong> by <strong>${input.days} days</strong>. Your new trial ends on <strong>${niceDate}</strong> — plenty of time to keep building.</p>
    <p style="margin: 20px 0;">
      <a href="${input.siteUrl}/${input.orgSlug}/admin" style="display: inline-block; padding: 10px 16px; border-radius: 8px; background: #111827; color: #ffffff; text-decoration: none; font-weight: 600;">
        Open ${input.orgName}
      </a>
    </p>
    <p style="margin: 0 0 12px; font-size: 13px; color: #475569;">If you have questions, just reply to this email — it goes straight to the founder.</p>
    <p style="margin: 14px 0 0; font-size: 12px; color: #64748b;">— lende</p>
  </div>
</body>
</html>`
}

export async function sendTrialExtendedEmail(input: {
    toEmail: string
    ownerName: string | null
    orgName: string
    orgSlug: string
    days: number
    newTrialEndsAt: string
}): Promise<{ success: true } | { success: false; error: string }> {
    const resend = getResendClient()
    if (!resend) {
        return { success: false, error: 'RESEND_API_KEY is not configured.' }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lende.shipbyx.com'

    try {
        const { error } = await resend.emails.send({
            from: 'lende <notifications@shipbyx.com>',
            replyTo: 'founder@shipbyx.com',
            to: [input.toEmail],
            subject: `Your lende trial was extended by ${input.days} days`,
            html: buildTrialExtendedHtml({
                orgName: input.orgName,
                orgSlug: input.orgSlug,
                ownerName: input.ownerName,
                days: input.days,
                newTrialEndsAt: input.newTrialEndsAt,
                siteUrl,
            }),
            tags: [{ name: 'category', value: 'trial-extended' }],
        })

        if (error) {
            return { success: false, error: error.message || 'Failed to send trial-extended email.' }
        }
        return { success: true }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
