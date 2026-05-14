import { Resend } from 'resend'

const getResendClient = () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return null
    return new Resend(apiKey)
}

function buildInvitationEmailHtml(input: {
    orgName: string
    role: string
    inviteUrl: string
}) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #0f172a; line-height: 1.6; margin: 0; padding: 24px; background: #f8fafc;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
    <h2 style="margin: 0 0 12px; font-size: 22px;">You're invited to ${input.orgName}</h2>
    <p style="margin: 0 0 14px;">You've been invited to join <strong>${input.orgName}</strong> on lende as <strong>${input.role}</strong>.</p>
    <p style="margin: 0 0 14px;">Click the button below to create your account and get started. This invitation expires in 7 days.</p>
    <p style="margin: 20px 0;">
      <a href="${input.inviteUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 8px; background: #111827; color: #ffffff; text-decoration: none; font-weight: 600;">
        Accept Invitation
      </a>
    </p>
    <p style="margin: 0 0 10px; font-size: 12px; color: #475569; word-break: break-all;">${input.inviteUrl}</p>
    <p style="margin: 14px 0 0; font-size: 12px; color: #64748b;">If you did not expect this invitation, you can safely ignore this email.</p>
  </div>
</body>
</html>
  `
}

export async function sendInvitationEmail(input: {
    toEmail: string
    orgName: string
    role: string
    inviteUrl: string
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
            subject: `You're invited to join ${input.orgName} on lende`,
            html: buildInvitationEmailHtml({
                orgName: input.orgName,
                role: input.role,
                inviteUrl: input.inviteUrl,
            }),
            tags: [{ name: 'category', value: 'invitation' }],
        })

        if (error) {
            return { success: false, error: error.message || 'Failed to send invitation email.' }
        }

        return { success: true }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
