'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const COOKIE_MAX_AGE = 60 * 60 * 24 // 24 hours

function cookieNameFor(orgSlug: string): string {
    return `wholesale_authenticated_${orgSlug.toLowerCase()}`
}

async function resolveOrgId(orgSlug: string): Promise<string | null> {
    const supabase = createServiceClient()
    const { data } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug.toLowerCase())
        .maybeSingle()
    return data?.id ?? null
}

export async function verifyWholesalePassword(
    password: string,
    orgSlug: string,
): Promise<{ success: boolean; error?: string }> {
    if (!password || password.trim() === '') {
        return { success: false, error: 'Please enter a password' }
    }

    const orgId = await resolveOrgId(orgSlug)
    if (!orgId) {
        return { success: false, error: 'Workspace not found' }
    }

    const supabase = createServiceClient()
    const { data: settings, error } = await supabase
        .from('app_settings')
        .select('booking_password')
        .eq('organization_id', orgId)
        .single()

    if (error) {
        console.error('Failed to fetch settings:', error)
        return { success: false, error: 'Server error. Please try again.' }
    }

    const requiredPassword = settings?.booking_password

    const cookieStore = await cookies()
    const cookieOptions = {
        maxAge: COOKIE_MAX_AGE,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
    }

    if (!requiredPassword || requiredPassword.trim() === '') {
        // No password required for this org → allow access
        cookieStore.set(cookieNameFor(orgSlug), 'true', cookieOptions)
        return { success: true }
    }

    if (password !== requiredPassword) {
        return { success: false, error: 'Incorrect password. Please try again.' }
    }

    cookieStore.set(cookieNameFor(orgSlug), 'true', cookieOptions)
    return { success: true }
}

export async function checkWholesaleAuth(orgSlug: string): Promise<boolean> {
    const cookieStore = await cookies()
    const authCookie = cookieStore.get(cookieNameFor(orgSlug))
    return authCookie?.value === 'true'
}

export async function logoutWholesale(orgSlug: string): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.delete(cookieNameFor(orgSlug))
}
