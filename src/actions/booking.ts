'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { RESERVATION_STATUSES } from '@/lib/constants/reservation-status'
import { track } from '@/lib/analytics/track'
import {
    buildReservationContractMetadata,
    isMissingReservationContractColumnsError,
    stripReservationContractMetadata,
} from '@/lib/reservations/contract'

// Public email domains to ignore for organization detection
const PUBLIC_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'outlook.com',
    'hotmail.com',
    'icloud.com',
    'me.com',
    'yahoo.com',
    'msn.com',
    'qq.com',
    '163.com',
    '126.com',
    'live.com',
    'aol.com',
    'protonmail.com',
    'mail.com',
])

interface GuestBookingData {
    item_id: string
    email: string
    full_name: string
    company_name?: string
    start_date: string
    end_date: string
    event_location?: string
    country?: string
    city_region?: string
    address_line1?: string
    address_line2?: string
    postcode?: string
    access_password?: string
}

function extractOrganizationDomain(email: string): string | null {
    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain) return null
    if (PUBLIC_EMAIL_DOMAINS.has(domain)) return null
    return domain
}

function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

export async function createGuestBooking(data: GuestBookingData, orgSlug: string) {
    // Check for service role key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('SUPABASE_SERVICE_ROLE_KEY is not configured')
        return { error: 'Server configuration error. Please contact support.' }
    }

    // Use service role to bypass RLS for guest bookings
    const supabase = createServiceClient()

    // 1. Validate email format
    if (!isValidEmail(data.email)) {
        return { error: 'Invalid email format' }
    }

    // 1b. Resolve org from slug — required so reservation.organization_id
    // can be set (migration 00053 made the column NOT NULL).
    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug.toLowerCase())
        .maybeSingle()
    if (!org) {
        console.error('createGuestBooking: unknown org slug', orgSlug)
        return { error: 'Workspace not found' }
    }

    // 2. Check if booking password is required (per-org setting)
    const { data: settings } = await supabase
        .from('app_settings')
        .select('booking_password')
        .eq('organization_id', org.id)
        .single()

    const requiredPassword = settings?.booking_password
    if (requiredPassword && requiredPassword.trim() !== '') {
        if (!data.access_password) {
            return { error: 'Access password is required. Please enter the password provided to you.' }
        }
        if (data.access_password !== requiredPassword) {
            return { error: 'Invalid access password. Please check and try again.' }
        }
    }

    // 3. Find or create profile by email
    const email = data.email.toLowerCase().trim()
    const organizationDomain = extractOrganizationDomain(email)

    const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single()

    let profileId: string

    if (existingProfile) {
        profileId = existingProfile.id
        // Optionally update organization_domain if not set
        if (organizationDomain) {
            await supabase
                .from('profiles')
                .update({ organization_domain: organizationDomain })
                .eq('id', profileId)
                .is('organization_domain', null)
        }
    } else {
        // Create new profile (generate UUID for id)
        const newId = crypto.randomUUID()
        const { error: createError } = await supabase
            .from('profiles')
            .insert({
                id: newId,
                email: email,
                full_name: data.full_name,
                company_name: data.company_name || null,
                organization_domain: organizationDomain,
                role: 'customer'
            })

        if (createError) {
            console.error('Profile creation failed:', createError)
            return { error: 'Failed to create profile' }
        }
        profileId = newId
    }

    // 4. Create reservation
    const reservationPayload = {
        item_id: data.item_id,
        renter_id: profileId,
        organization_id: org.id,
        start_date: data.start_date,
        end_date: data.end_date,
        status: RESERVATION_STATUSES.PENDING_REQUEST,
        country: data.country || null,
        city_region: data.city_region || null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        postcode: data.postcode || null,
        ...buildReservationContractMetadata({
            startDate: data.start_date,
            endDate: data.end_date,
            eventLocation: data.event_location,
            addressLine1: data.address_line1 || null,
            addressLine2: data.address_line2 || null,
            cityRegion: data.city_region || null,
            postcode: data.postcode || null,
            country: data.country || null,
        }),
    }

    let { error: reservationError } = await supabase
        .from('reservations')
        .insert(reservationPayload)

    if (reservationError && isMissingReservationContractColumnsError(reservationError)) {
        console.warn(
            '[Reservations] Missing contract metadata columns. Falling back to legacy guest booking insert.',
            reservationError
        )

        const fallback = await supabase
            .from('reservations')
            .insert(stripReservationContractMetadata(reservationPayload))

        reservationError = fallback.error ?? null
    }

    if (reservationError) {
        console.error('Reservation creation failed:', reservationError)
        return { error: 'Failed to create reservation' }
    }

    // Check if this is the org's first reservation
    const { count } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)

    if (count === 1) {
        track('first_reservation_created', { item_id: data.item_id, org_slug: orgSlug })
    }

    revalidatePath(`/${orgSlug}/catalog/${data.item_id}`)
    revalidatePath(`/catalog/${data.item_id}`)
    return { success: true }
}
