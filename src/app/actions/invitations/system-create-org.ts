'use server'

import { headers } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendInvitationEmail } from '@/lib/email/invitation'

const SYSTEM_ADMIN_EMAILS = new Set([
    'rongze.work@gmail.com',
])

export interface SystemCreateOrgInput {
    orgName: string
    slug: string
    adminEmail: string
}

export type SystemCreateOrgResult =
    | { ok: true; orgId: string; slug: string; invitationId: string; emailSent: boolean }
    | { ok: false; error: string }

async function getOrigin(): Promise<string> {
    try {
        const h = await headers()
        const proto = h.get('x-forwarded-proto') ?? 'https'
        const host = h.get('x-forwarded-host') ?? h.get('host')
        if (host) return `${proto}://${host}`
    } catch {}
    return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

export async function systemCreateOrgAction(
    input: SystemCreateOrgInput
): Promise<SystemCreateOrgResult> {
    const { orgName, slug: rawSlug, adminEmail: rawEmail } = input
    const slug = rawSlug.trim().toLowerCase()
    const adminEmail = rawEmail.trim().toLowerCase()

    // Auth check: must be logged in as system admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email || !SYSTEM_ADMIN_EMAILS.has(user.email)) {
        return { ok: false, error: 'Access denied. System admin only.' }
    }

    if (!orgName || orgName.trim().length < 2) {
        return { ok: false, error: 'Organization name must be at least 2 characters.' }
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || slug.length < 3 || slug.length > 32) {
        return { ok: false, error: 'Slug must be 3-32 chars, lowercase alphanumeric and dashes.' }
    }
    if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
        return { ok: false, error: 'Please enter a valid admin email address.' }
    }

    const service = createServiceClient()

    // Create organization
    const { data: org, error: orgError } = await service
        .from('organizations')
        .insert({
            slug,
            name: orgName.trim(),
            plan: 'trial',
            trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id, slug')
        .single()

    if (orgError || !org) {
        const msg = orgError?.message ?? 'unknown error'
        if (/duplicate key|unique constraint/i.test(msg)) {
            return { ok: false, error: `Slug "${slug}" is already taken.` }
        }
        return { ok: false, error: `Could not create organization: ${msg}` }
    }

    // Create admin invitation
    const { data: invitation, error: invError } = await service
        .from('organization_invitations')
        .insert({
            organization_id: org.id,
            email: adminEmail,
            role: 'admin',
            invited_by: user.id,
        })
        .select('id, token')
        .single()

    if (invError || !invitation) {
        // Rollback org
        await service.from('organizations').delete().eq('id', org.id)
        return { ok: false, error: `Could not create invitation: ${invError?.message ?? 'unknown error'}` }
    }

    const origin = await getOrigin()
    const inviteUrl = `${origin}/invite/${invitation.token}`

    const emailResult = await sendInvitationEmail({
        toEmail: adminEmail,
        orgName: orgName.trim(),
        role: 'admin',
        inviteUrl,
    })

    return {
        ok: true,
        orgId: org.id,
        slug: org.slug,
        invitationId: invitation.id,
        emailSent: emailResult.success,
    }
}
