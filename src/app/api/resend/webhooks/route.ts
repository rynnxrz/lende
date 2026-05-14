import { NextRequest, NextResponse } from 'next/server'
import { track } from '@/lib/analytics/track'

export async function POST(request: NextRequest) {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (secret) {
        const svixId = request.headers.get('svix-id')
        const svixSignature = request.headers.get('svix-signature')
        if (!svixId || !svixSignature) {
            return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
        }
    }

    const body = await request.json()
    const { type, data } = body

    switch (type) {
        case 'email.opened':
            if (data?.tags?.includes('invitation')) {
                track('invitation_email_opened', {
                    email_id: data.email_id ?? null,
                    to: data.to?.[0] ?? null,
                })
            }
            break

        case 'email.clicked':
            if (data?.tags?.includes('invitation')) {
                track('invitation_link_clicked', {
                    email_id: data.email_id ?? null,
                    to: data.to?.[0] ?? null,
                    url: data.click?.link ?? null,
                })
            }
            break
    }

    return NextResponse.json({ received: true })
}
