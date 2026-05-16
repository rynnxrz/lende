'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { RESERVATION_STATUSES } from '@/lib/constants/reservation-status'
import { sendNewRequestEmail } from '@/lib/email/sendNewRequestEmail'

interface LookbookRequestData {
    items: { id: string; name: string }[]
    email: string
    fullName: string
    notes?: string
    startDate: string
    endDate: string
    organizationId: string
    lookbookId: string
}

const PUBLIC_EMAIL_DOMAINS = new Set([
    'gmail.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'me.com',
    'yahoo.com', 'qq.com', '163.com', '126.com', 'live.com', 'protonmail.com',
])

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function submitLookbookRequest(data: LookbookRequestData) {
    const supabase = createServiceClient()

    if (!data.items.length) return { error: 'No items selected.' }
    if (!isValidEmail(data.email)) return { error: 'Invalid email address.' }
    if (!data.startDate || !data.endDate) return { error: 'Please select rental dates.' }
    if (!data.fullName.trim()) return { error: 'Name is required.' }

    const email = data.email.toLowerCase().trim()
    const domain = email.split('@')[1]?.toLowerCase()
    const orgDomain = domain && !PUBLIC_EMAIL_DOMAINS.has(domain) ? domain : null

    const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single()

    let profileId: string

    if (existing) {
        profileId = existing.id
        await supabase.from('profiles').update({
            full_name: data.fullName,
        }).eq('id', profileId)
    } else {
        profileId = crypto.randomUUID()
        const { error: createErr } = await supabase.from('profiles').insert({
            id: profileId,
            email,
            full_name: data.fullName,
            organization_domain: orgDomain,
            role: 'customer',
        })
        if (createErr) {
            console.error('[lookbookRequest] profile create failed:', createErr)
            return { error: 'Failed to create profile.' }
        }
    }

    const groupId = crypto.randomUUID()
    const fingerprint = `LB-${data.lookbookId}-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const rows = data.items.map((item) => ({
        item_id: item.id,
        renter_id: profileId,
        start_date: data.startDate,
        end_date: data.endDate,
        status: RESERVATION_STATUSES.PENDING_REQUEST,
        group_id: groupId,
        dispatch_notes: data.notes
            ? `[Lookbook Request] ${data.notes}`
            : '[Lookbook Request]',
        fingerprint: `${fingerprint}-${item.id}`,
        organization_id: data.organizationId,
    }))

    const { error: insertErr } = await supabase.from('reservations').insert(rows)

    if (insertErr) {
        if (insertErr.code === '23505') {
            return { success: true, groupId }
        }
        console.error('[lookbookRequest] insert failed:', insertErr)

        try {
            await supabase.from('system_errors').insert({
                error_type: 'LOOKBOOK_REQUEST_FAILED',
                payload: { error: insertErr, data: { ...data, email } },
                resolved: false,
            })
        } catch (logErr) {
            console.error('[lookbookRequest] error log failed:', logErr)
        }

        return { error: 'Failed to submit request. Please try again.' }
    }

    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL
    if (adminEmail) {
        void sendNewRequestEmail({
            adminEmail,
            customerName: data.fullName,
            customerEmail: email,
            companyName: null,
            startDate: data.startDate,
            endDate: data.endDate,
            eventLocation: null,
            addressLine1: '',
            addressLine2: null,
            cityRegion: '',
            country: '',
            postcode: '',
            items: data.items,
            notes: data.notes || null,
            groupId,
        })
    }

    return { success: true, groupId }
}
