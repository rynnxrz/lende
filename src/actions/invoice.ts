'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidateAdminPath } from '@/lib/revalidate-admin'
import { requireAdmin } from '@/lib/auth/guards'
import { format } from 'date-fns'
import { sendApprovalEmail } from '@/lib/email/sendApprovalEmail'
import {
    buildRentalTierDescription,
    computeEffectiveDailyRate,
    computeInvoicePricing,
    computeRentalChargeFromRetail,
} from '@/lib/invoice/pricing'
import { RESERVATION_STATUSES, isArchivedReservation } from '@/lib/constants/reservation-status'
import { buildInvoicePdfBuffer } from '@/lib/invoice/document'
import { buildPublicPaymentUrl } from '@/lib/public-url'
import { getInclusiveReservationDays, parseReservationDateInput } from '@/lib/reservations/dates'

// ============================================================
// Invoice Types (until types are regenerated from Supabase)
// ============================================================

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'VOID' | 'OVERDUE'
export type InvoiceCategory = 'RENTAL' | 'WHOLESALE' | 'MANUAL'

export interface InvoiceLineItem {
    id?: string
    item_id?: string | null
    name: string
    description?: string | null
    quantity: number
    unit_price: number
    total: number
}

export interface Invoice {
    id: string
    invoice_number: string
    category: InvoiceCategory
    reservation_id?: string | null
    customer_id?: string | null
    customer_name: string
    customer_email?: string | null
    billing_address?: Record<string, unknown>
    billing_profile_id?: string | null
    currency: string
    subtotal_amount?: number
    discount_percentage?: number
    discount_amount?: number
    deposit_amount?: number
    total_amount: number
    issue_date: string
    due_date?: string | null
    status: InvoiceStatus
    signed_file_path?: string | null
    notes?: string | null
    created_at: string
    updated_at: string
    items?: InvoiceLineItem[]
}

export interface CreateManualInvoiceInput {
    customer_name: string
    customer_email?: string
    customer_id?: string
    billing_address?: Record<string, unknown>
    billing_profile_id?: string
    items: Omit<InvoiceLineItem, 'id'>[]
    notes?: string
    issue_date?: string
    due_date?: string
}

export interface UpdateInvoiceInput {
    customer_name?: string
    customer_email?: string
    billing_address?: Record<string, unknown>
    billing_profile_id?: string
    notes?: string
    due_date?: string
    items?: Omit<InvoiceLineItem, 'id'>[]
}

interface ReservationPricingOverrides {
    discountPercentage: number | null
    depositAmountOverride: number | null
}

async function resolveActiveReservationIdsForInvoiceGroup(
    supabase: Awaited<ReturnType<typeof createClient>>,
    reservationId: string,
    groupId?: string | null
) {
    let reservationRows: Array<{ id: string; status: string | null; admin_notes: string | null }> = []

    if (groupId) {
        const { data, error } = await supabase
            .from('reservations')
            .select('id, status, admin_notes')
            .eq('group_id', groupId)

        if (error) {
            return { data: null as string[] | null, error: error.message }
        }

        reservationRows = data ?? []
    } else {
        const { data, error } = await supabase
            .from('reservations')
            .select('id, status, admin_notes')
            .eq('id', reservationId)

        if (error) {
            return { data: null as string[] | null, error: error.message }
        }

        reservationRows = data ?? []
    }

    return {
        data: reservationRows.filter((row) => !isArchivedReservation(row)).map((row) => row.id),
        error: null as string | null,
    }
}

function sanitizeOptionalNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function resolveRequiredRetailPrice(item: { replacement_cost?: number | null | string | unknown }) {
    const value = item.replacement_cost != null ? Number(item.replacement_cost) : null
    if (value === null || !Number.isFinite(value) || value <= 0) {
        return null
    }
    return value
}

function resolveReservationPricingOverrides(reservation: Record<string, unknown>): ReservationPricingOverrides {
    const discountFromReservation = sanitizeOptionalNumber(
        reservation.discount_percent ?? reservation.discount_percentage
    )
    const depositFromReservation = sanitizeOptionalNumber(
        reservation.deposit_override ??
        reservation.deposit_amount_override ??
        reservation.deposit_amount
    )

    return {
        discountPercentage: discountFromReservation,
        depositAmountOverride: depositFromReservation,
    }
}

function isMissingReservationPricingColumnsError(error: { message?: string | null } | null | undefined) {
    const message = error?.message ?? ''
    return (
        message.includes('discount_percent')
        || message.includes('deposit_override')
        || message.includes('deposit_amount')
        || message.includes('schema cache')
    )
}

function isMissingInvoicePricingColumnsError(error: { message?: string | null } | null | undefined) {
    const message = error?.message ?? ''
    return (
        message.includes('subtotal_amount')
        || message.includes('discount_percentage')
        || message.includes('discount_amount')
        || message.includes('deposit_amount')
        || message.includes('schema cache')
    )
}

async function createInvoiceRecord(
    supabase: Awaited<ReturnType<typeof createClient>>,
    payload: {
        category: InvoiceCategory
        reservation_id: string
        customer_id: string | null
        customer_name: string
        customer_email: string | null
        billing_address: Record<string, unknown>
        billing_profile_id: string | null
        subtotal_amount: number
        discount_percentage: number
        discount_amount: number
        deposit_amount: number
        total_amount: number
        status: InvoiceStatus
    }
) {
    const fullInsert = await supabase
        .from('invoices')
        .insert(payload)
        .select()
        .single()

    if (!fullInsert.error) {
        return fullInsert
    }

    if (!isMissingInvoicePricingColumnsError(fullInsert.error)) {
        return fullInsert
    }

    console.warn(
        '[Invoices] Missing pricing columns on invoices. Falling back to legacy invoice insert.',
        fullInsert.error
    )

    return await supabase
        .from('invoices')
        .insert({
            category: payload.category,
            reservation_id: payload.reservation_id,
            customer_id: payload.customer_id,
            customer_name: payload.customer_name,
            customer_email: payload.customer_email,
            billing_address: payload.billing_address,
            billing_profile_id: payload.billing_profile_id,
            total_amount: payload.total_amount,
            status: payload.status,
        })
        .select()
        .single()
}

async function fetchReservationsForInvoice(
    supabase: Awaited<ReturnType<typeof createClient>>,
    reservationId: string
) {
    const fullSelect = `
        id,
        group_id,
        renter_id,
        start_date,
        end_date,
        discount_percent,
        deposit_override,
        deposit_amount,
        items (id, name, sku, rental_price, replacement_cost, description),
        profiles:renter_id (id, full_name, email, company_name, address_line1, address_line2, city_region, country, postcode)
    `
    const legacySelect = `
        id,
        group_id,
        renter_id,
        start_date,
        end_date,
        items (id, name, sku, rental_price, replacement_cost, description),
        profiles:renter_id (id, full_name, email, company_name, address_line1, address_line2, city_region, country, postcode)
    `

    const { data, error } = await supabase
        .from('reservations')
        .select(fullSelect)
        .eq('id', reservationId)

    if (!error) {
        return { data, error: null as typeof error }
    }

    if (!isMissingReservationPricingColumnsError(error)) {
        return { data: null, error }
    }

    console.warn(
        '[Invoices] Missing reservation pricing columns. Falling back to legacy reservation select.',
        error
    )

    const fallback = await supabase
        .from('reservations')
        .select(legacySelect)
        .eq('id', reservationId)

    return {
        data: fallback.data ?? null,
        error: fallback.error ?? null,
    }
}

async function resolveLatestInvoiceByReservation(
    supabase: Awaited<ReturnType<typeof createClient>>,
    reservationId: string
) {
    const { data: reservation, error: reservationError } = await supabase
        .from('reservations')
        .select('id, group_id, start_date, end_date, profiles:renter_id(full_name, email, company_name), items(name)')
        .eq('id', reservationId)
        .single()

    if (reservationError || !reservation) {
        return { reservation: null, invoice: null, error: 'Reservation not found' as const }
    }

    const candidateReservationIds = new Set<string>([reservation.id])

    if (reservation.group_id) {
        const { data: siblings } = await supabase
            .from('reservations')
            .select('id')
            .eq('group_id', reservation.group_id)

        for (const sibling of siblings || []) {
            if (sibling?.id) {
                candidateReservationIds.add(sibling.id)
            }
        }
    }

    const { data: invoices, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, invoice_number, reservation_id, customer_name, customer_email, total_amount, billing_profile_id, status')
        .in('reservation_id', Array.from(candidateReservationIds))
        .order('created_at', { ascending: false })
        .limit(1)

    if (invoiceError || !invoices || invoices.length === 0) {
        return { reservation, invoice: null, error: 'Invoice not found' as const }
    }

    return { reservation, invoice: invoices[0], error: null }
}

async function uploadInvoicePdfToStorage(invoiceId: string, pdfBuffer: Buffer) {
    const serviceClient = createServiceClient()
    const storagePath = `invoices/${invoiceId}/latest.pdf`

    const { error: uploadError } = await serviceClient.storage
        .from('rental_items')
        .upload(storagePath, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true,
        })

    if (uploadError) {
        return { success: false, error: uploadError.message, url: null as string | null }
    }

    const { data: signedData, error: signedError } = await serviceClient.storage
        .from('rental_items')
        .createSignedUrl(storagePath, 60 * 60)

    if (signedError || !signedData?.signedUrl) {
        return { success: false, error: signedError?.message || 'Failed to create signed URL', url: null as string | null }
    }

    return { success: true, error: null as string | null, url: signedData.signedUrl }
}

async function signStoredInvoicePdf(invoiceId: string) {
    const serviceClient = createServiceClient()
    const { data: invoice } = await serviceClient
        .from('invoices')
        .select('signed_file_path')
        .eq('id', invoiceId)
        .maybeSingle()

    const storagePath = invoice?.signed_file_path as string | null | undefined
    if (!storagePath) return null

    const { data, error } = await serviceClient.storage
        .from('rental_items')
        .createSignedUrl(storagePath, 60 * 60)

    if (error || !data?.signedUrl) return null
    return data.signedUrl
}

export async function getInvoicePdfDownloadUrl(invoiceId: string) {
    await requireAdmin()

    const existingUrl = await signStoredInvoicePdf(invoiceId)
    if (existingUrl) {
        return { success: true, error: null as string | null, url: existingUrl }
    }

    const pdfResult = await buildInvoicePdfBuffer(invoiceId)
    if (!pdfResult.success || !pdfResult.data) {
        return { success: false, error: pdfResult.error || 'Failed to generate PDF', url: null as string | null }
    }

    const uploadResult = await uploadInvoicePdfToStorage(invoiceId, pdfResult.data)
    if (!uploadResult.success || !uploadResult.url) {
        return { success: false, error: uploadResult.error || 'Failed to upload invoice PDF', url: null as string | null }
    }

    await createServiceClient()
        .from('invoices')
        .update({ signed_file_path: `invoices/${invoiceId}/latest.pdf` })
        .eq('id', invoiceId)

    return { success: true, error: null as string | null, url: uploadResult.url }
}

// ============================================================
// Invoice CRUD Actions
// ============================================================

/**
 * Creates a manual invoice for services or ad-hoc charges.
 * Does NOT lock inventory (manual invoices are for services).
 */
export async function createManualInvoice(input: CreateManualInvoiceInput) {
    await requireAdmin()
    const supabase = await createClient()

    // Calculate total from items
    const total_amount = input.items.reduce((sum, item) => sum + item.total, 0)

    // Create invoice (invoice_number is auto-generated by trigger)
    const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
            category: 'MANUAL',
            customer_name: input.customer_name,
            customer_email: input.customer_email || null,
            customer_id: input.customer_id || null,
            billing_address: input.billing_address || {},
            billing_profile_id: input.billing_profile_id || null,
            subtotal_amount: total_amount,
            discount_percentage: 0,
            discount_amount: 0,
            deposit_amount: 0,
            total_amount,
            issue_date: input.issue_date || new Date().toISOString().split('T')[0],
            due_date: input.due_date || null,
            notes: input.notes || null,
            status: 'DRAFT',
        })
        .select()
        .single()

    if (invoiceError) {
        console.error('Failed to create invoice:', invoiceError)
        return { success: false, error: invoiceError.message, data: null }
    }

    // Insert invoice items
    const itemsToInsert = input.items.map(item => ({
        invoice_id: invoice.id,
        item_id: item.item_id || null,
        name: item.name,
        description: item.description || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
    }))

    const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert)

    if (itemsError) {
        console.error('Failed to create invoice items:', itemsError)
        // Rollback: delete the invoice
        await supabase.from('invoices').delete().eq('id', invoice.id)
        return { success: false, error: itemsError.message, data: null }
    }

    revalidateAdminPath('/invoices')
    return { success: true, error: null, data: invoice }
}

/**
 * Generates an invoice from an existing reservation.
 * Creates snapshot of items at current prices.
 */
export async function generateInvoiceFromReservation(
    reservationId: string,
    billingProfileId?: string,
    pricingOverrides?: {
        discountPercentage?: number
        depositAmountOverride?: number | null
        reservationIds?: string[]
    }
) {
    await requireAdmin()
    const supabase = await createClient()

    // Fetch reservation with items and customer
    const { data: reservations, error: resError } = await fetchReservationsForInvoice(
        supabase,
        reservationId
    )

    if (resError || !reservations || reservations.length === 0) {
        console.error('Failed to fetch reservation:', resError)
        return { success: false, error: 'Reservation not found', data: null }
    }

    // Get all reservations in the same group
    const primaryReservation = reservations[0]
    const groupId = primaryReservation.group_id
    const requestedReservationIds = Array.from(new Set(pricingOverrides?.reservationIds ?? [reservationId]))

    let allReservations: Array<Record<string, unknown>> = [primaryReservation as Record<string, unknown>]
    if (groupId) {
        const { data: groupRes } = await supabase
            .from('reservations')
            .select(`
                id,
                group_id,
                start_date,
                end_date,
                items (id, name, sku, rental_price, replacement_cost, description)
            `)
            .eq('group_id', groupId)

        if (groupRes) {
            allReservations = groupRes as unknown as Array<Record<string, unknown>>
        }
    }

    const allReservationIdSet = new Set(allReservations.map((reservation) => String(reservation.id)))
    const hasInvalidReservationId = requestedReservationIds.some((requestedId) => !allReservationIdSet.has(requestedId))
    if (hasInvalidReservationId) {
        return { success: false, error: 'One or more selected items are no longer part of this request', data: null }
    }

    const reservationOrder = new Map(requestedReservationIds.map((requestedId, index) => [requestedId, index]))
    const filteredReservations = [...allReservations]
        .filter((reservation) => requestedReservationIds.includes(String(reservation.id)))
        .sort((left, right) => {
            return (reservationOrder.get(String(left.id)) ?? 0) - (reservationOrder.get(String(right.id)) ?? 0)
        })

    if (filteredReservations.length === 0) {
        return { success: false, error: 'Keep at least one item in the invoice before generating it', data: null }
    }

    // Get profile from primary reservation
    const profile = primaryReservation.profiles as {
        id?: string
        full_name?: string
        email?: string
        company_name?: string
        address_line1?: string
        address_line2?: string
        city_region?: string
        country?: string
        postcode?: string
    } | null

    // Build billing address from profile
    const billingAddress: Record<string, unknown> = {}
    if (profile) {
        if (profile.address_line1) billingAddress.line1 = profile.address_line1
        if (profile.address_line2) billingAddress.line2 = profile.address_line2
        if (profile.city_region) billingAddress.city = profile.city_region
        if (profile.country) billingAddress.country = profile.country
        if (profile.postcode) billingAddress.postcode = profile.postcode
    }

    // Calculate items and total
    const invoiceItems: Omit<InvoiceLineItem, 'id'>[] = []
    let totalAmount = 0
    let replacementCostTotal = 0

    for (const res of filteredReservations) {
        const itemRecord = res.items as {
            id: string
            name: string
            sku: string
            rental_price: number
            replacement_cost?: number | null
            description?: string
        } | Array<{
            id: string
            name: string
            sku: string
            rental_price: number
            replacement_cost?: number | null
            description?: string
        }> | null
        const item = Array.isArray(itemRecord) ? itemRecord[0] : itemRecord
        if (!item) continue

        const startDateRaw = String(res.start_date)
        const endDateRaw = String(res.end_date)
        const days = getInclusiveReservationDays(startDateRaw, endDateRaw)
        if (!days) {
            return {
                success: false,
                error: `Invalid reservation date range for "${item.name}": end date must be on or after start date.`,
                data: null,
            }
        }

        const retailPrice = resolveRequiredRetailPrice(item)
        if (retailPrice === null) {
            return {
                success: false,
                error: `RRP missing for "${item.name}". replacement_cost must be greater than 0 before generating invoice.`,
                data: null,
            }
        }
        replacementCostTotal += retailPrice
        const lineTotal = computeRentalChargeFromRetail({
            retailPrice,
            rentalDays: days,
        })
        const effectiveDailyRate = computeEffectiveDailyRate(lineTotal, days)
        const tierDescription = buildRentalTierDescription({
            retailPrice,
            rentalDays: days,
        })

        invoiceItems.push({
            item_id: item.id,
            name: item.name,
            description: item.sku
                ? `${tierDescription} | SKU: ${item.sku} | ${startDateRaw} - ${endDateRaw}`
                : `${tierDescription} | ${startDateRaw} - ${endDateRaw}`,
            quantity: days,
            unit_price: effectiveDailyRate,
            total: lineTotal,
        })

        totalAmount += lineTotal
    }

    const reservationPricingOverrides = resolveReservationPricingOverrides(
        primaryReservation as Record<string, unknown>
    )
    const effectiveDiscountPercentage =
        pricingOverrides?.discountPercentage ??
        reservationPricingOverrides.discountPercentage ??
        undefined
    const pricing = computeInvoicePricing({
        subtotal: totalAmount,
        discountPercentage: effectiveDiscountPercentage,
        depositAmountOverride:
            pricingOverrides?.depositAmountOverride ??
            reservationPricingOverrides.depositAmountOverride,
        replacementCostTotal,
    })

    // Determine category based on reservation context (default to RENTAL)
    const category: InvoiceCategory = 'RENTAL'

    // Create the invoice
    const { data: invoice, error: createError } = await createInvoiceRecord(supabase, {
        category,
        reservation_id: reservationId,
        customer_id: profile?.id || null,
        customer_name: profile?.full_name || profile?.company_name || 'Customer',
        customer_email: profile?.email || null,
        billing_address: billingAddress,
        billing_profile_id: billingProfileId || null,
        subtotal_amount: pricing.subtotal,
        discount_percentage: pricing.discountPercentage,
        discount_amount: pricing.discountAmount,
        deposit_amount: pricing.depositAmount,
        total_amount: pricing.totalDue,
        status: 'DRAFT',
    })

    if (createError) {
        console.error('Failed to create invoice:', createError)
        return { success: false, error: createError.message, data: null }
    }

    // Insert invoice items
    const itemsToInsert = invoiceItems.map(item => ({
        invoice_id: invoice.id,
        item_id: item.item_id || null,
        name: item.name,
        description: item.description || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
    }))

    const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert)

    if (itemsError) {
        console.error('Failed to create invoice items:', itemsError)
        await supabase.from('invoices').delete().eq('id', invoice.id)
        return { success: false, error: itemsError.message, data: null }
    }

    revalidateAdminPath('/invoices')
    revalidateAdminPath('/reservations')
    return { success: true, error: null, data: invoice }
}

/**
 * Marks an invoice as paid and syncs the linked reservation status.
 */
export async function markInvoiceAsPaid(invoiceId: string) {
    await requireAdmin()
    const supabase = await createClient()

    // Update invoice status
    const { data: invoice, error: updateError } = await supabase
        .from('invoices')
        .update({ status: 'PAID', signed_file_path: null })
        .eq('id', invoiceId)
        .select('reservation_id')
        .single()

    if (updateError) {
        console.error('Failed to update invoice:', updateError)
        return { success: false, error: updateError.message }
    }

    // Sync reservation status if linked
    if (invoice?.reservation_id) {
        // First get the group_id from the reservation
        const { data: reservation } = await supabase
            .from('reservations')
            .select('group_id')
            .eq('id', invoice.reservation_id)
            .single()

        const activeReservationIdsResult = await resolveActiveReservationIdsForInvoiceGroup(
            supabase,
            invoice.reservation_id,
            reservation?.group_id
        )

        if (activeReservationIdsResult.data?.length) {
            await supabase
                .from('reservations')
                .update({ status: RESERVATION_STATUSES.UPCOMING })
                .in('id', activeReservationIdsResult.data)
        }

        revalidateAdminPath('/reservations')
    }

    revalidateAdminPath('/invoices')
    return { success: true, error: null }
}

/**
 * Updates an invoice (only allowed for DRAFT status).
 */
export async function updateInvoice(invoiceId: string, input: UpdateInvoiceInput) {
    await requireAdmin()
    const supabase = await createClient()

    // Check current status
    const { data: currentInvoice, error: checkError } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', invoiceId)
        .single()

    if (checkError || !currentInvoice) {
        return { success: false, error: 'Invoice not found', data: null }
    }

    if (currentInvoice.status !== 'DRAFT') {
        return { success: false, error: 'Only draft invoices can be edited', data: null }
    }

    // Calculate new total if items are provided
    let total_amount: number | undefined
    if (input.items && input.items.length > 0) {
        total_amount = input.items.reduce((sum, item) => sum + item.total, 0)
    }

    // Update invoice
    const updateData: Record<string, unknown> = {}
    if (input.customer_name) updateData.customer_name = input.customer_name
    if (input.customer_email !== undefined) updateData.customer_email = input.customer_email
    if (input.billing_address) updateData.billing_address = input.billing_address
    if (input.billing_profile_id) updateData.billing_profile_id = input.billing_profile_id
    if (input.notes !== undefined) updateData.notes = input.notes
    if (input.due_date !== undefined) updateData.due_date = input.due_date
    if (total_amount !== undefined) {
        updateData.subtotal_amount = total_amount
        updateData.discount_percentage = 0
        updateData.discount_amount = 0
        updateData.deposit_amount = 0
        updateData.total_amount = total_amount
    }

    const { data: invoice, error: updateError } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId)
        .select()
        .single()

    if (updateError) {
        console.error('Failed to update invoice:', updateError)
        return { success: false, error: updateError.message, data: null }
    }

    // Update items if provided
    if (input.items && input.items.length > 0) {
        // Delete existing items
        await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId)

        // Insert new items
        const itemsToInsert = input.items.map(item => ({
            invoice_id: invoiceId,
            item_id: item.item_id || null,
            name: item.name,
            description: item.description || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
        }))

        const { error: itemsError } = await supabase
            .from('invoice_items')
            .insert(itemsToInsert)

        if (itemsError) {
            console.error('Failed to update invoice items:', itemsError)
            return { success: false, error: itemsError.message, data: null }
        }
    }

    revalidateAdminPath('/invoices')
    revalidateAdminPath(`/invoices/${invoiceId}`)
    return { success: true, error: null, data: invoice }
}

/**
 * Fetches a single invoice with its items.
 */
export async function getInvoice(invoiceId: string) {
    const supabase = await createClient()

    const { data: invoice, error } = await supabase
        .from('invoices')
        .select(`
            *,
            invoice_items (*),
            billing_profiles (*)
        `)
        .eq('id', invoiceId)
        .single()

    if (error) {
        console.error('Failed to fetch invoice:', error)
        return { data: null, error: error.message }
    }

    return { data: invoice, error: null }
}

/**
 * Fetches all invoices with optional filtering.
 */
export async function getInvoices(filters?: {
    status?: InvoiceStatus | InvoiceStatus[]
    category?: InvoiceCategory
    unpaidOnly?: boolean
}) {
    const supabase = await createClient()

    let query = supabase
        .from('invoices')
        .select(`
            *,
            invoice_items (id, name, quantity),
            reservation:reservations (id, group_id)
        `)
        .order('created_at', { ascending: false })

    if (filters?.unpaidOnly) {
        query = query.in('status', ['DRAFT', 'SENT', 'OVERDUE'])
    } else if (filters?.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
        query = query.in('status', statuses)
    }

    if (filters?.category) {
        query = query.eq('category', filters.category)
    }

    const { data, error } = await query

    if (error) {
        console.error('Failed to fetch invoices:', error)
        return { data: null, error: error.message }
    }

    return { data, error: null }
}

/**
 * Deletes an invoice (only DRAFT or VOID status).
 */
export async function deleteInvoice(invoiceId: string) {
    await requireAdmin()
    const supabase = await createClient()

    // Check current status
    const { data: invoice, error: checkError } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', invoiceId)
        .single()

    if (checkError || !invoice) {
        return { success: false, error: 'Invoice not found' }
    }

    if (!['DRAFT', 'VOID'].includes(invoice.status)) {
        return { success: false, error: 'Only draft or void invoices can be deleted' }
    }

    // Delete invoice (items will cascade)
    const { error: deleteError } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId)

    if (deleteError) {
        console.error('Failed to delete invoice:', deleteError)
        return { success: false, error: deleteError.message }
    }

    revalidateAdminPath('/invoices')
    return { success: true, error: null }
}

/**
 * Voids an invoice (marks as VOID instead of deleting).
 */
export async function voidInvoice(invoiceId: string) {
    await requireAdmin()
    const supabase = await createClient()

    const { error } = await supabase
        .from('invoices')
        .update({ status: 'VOID', signed_file_path: null })
        .eq('id', invoiceId)

    if (error) {
        console.error('Failed to void invoice:', error)
        return { success: false, error: error.message }
    }

    revalidateAdminPath('/invoices')
    return { success: true, error: null }
}

/**
 * Updates invoice status (e.g., DRAFT -> SENT).
 */
export async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
    await requireAdmin()
    const supabase = await createClient()

    const { error } = await supabase
        .from('invoices')
        .update({ status, signed_file_path: null })
        .eq('id', invoiceId)

    if (error) {
        console.error('Failed to update invoice status:', error)
        return { success: false, error: error.message }
    }

    revalidateAdminPath('/invoices')
    return { success: true, error: null }
}

export async function getInvoicePdfViewUrl(reservationId: string) {
    await requireAdmin()
    const supabase = await createClient()

    const { invoice, error } = await resolveLatestInvoiceByReservation(supabase, reservationId)
    if (error || !invoice) {
        return { success: false, error: error || 'Invoice not found', url: null as string | null }
    }

    return getInvoicePdfDownloadUrl(invoice.id)
}

export async function sendInvoiceEmail(reservationId: string) {
    await requireAdmin()
    const supabase = await createClient()

    const resolved = await resolveLatestInvoiceByReservation(supabase, reservationId)
    if (resolved.error || !resolved.invoice || !resolved.reservation) {
        return { success: false, error: resolved.error || 'Unable to resolve reservation/invoice' }
    }

    const reservation = resolved.reservation
    const invoice = resolved.invoice

    const pdfResult = await downloadInvoicePdf(invoice.id)
    if (!pdfResult.success || !pdfResult.data) {
        return { success: false, error: pdfResult.error || 'Failed to generate invoice PDF' }
    }

    const { data: settings } = await supabase
        .from('app_settings')
        .select('contact_email, email_approval_body, email_footer')
        .single()

    const { data: billingProfile } = await supabase
        .from('billing_profiles')
        .select('company_header')
        .eq('id', invoice.billing_profile_id ?? '')
        .maybeSingle()

    const profileRaw = (reservation as {
        profiles?: { full_name?: string; email?: string; company_name?: string } | Array<{ full_name?: string; email?: string; company_name?: string }>
    }).profiles
    const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
    const itemRaw = (reservation as {
        items?: { name?: string } | Array<{ name?: string }>
    }).items
    const item = Array.isArray(itemRaw) ? itemRaw[0] : itemRaw

    const startDateRaw = String(reservation.start_date)
    const endDateRaw = String(reservation.end_date)
    const start = parseReservationDateInput(startDateRaw)
    const end = parseReservationDateInput(endDateRaw)
    const totalDays = getInclusiveReservationDays(startDateRaw, endDateRaw)
    if (!start || !end || !totalDays) {
        return { success: false, error: 'Invalid reservation dates: return date must be on or after start date.' }
    }
    const paymentUrl = buildPublicPaymentUrl({
        reservationId,
        invoiceId: invoice.id,
    })
    const recipientEmail = invoice.customer_email || profile?.email

    if (!recipientEmail) {
        return { success: false, error: 'Customer email is missing' }
    }

    const sendResult = await sendApprovalEmail({
        toIndices: [recipientEmail],
        customerName: invoice.customer_name || profile?.full_name || 'Customer',
        itemName: item?.name || 'Reservation',
        startDate: format(start, 'MMM dd, yyyy'),
        endDate: format(end, 'MMM dd, yyyy'),
        totalDays,
        totalPrice: Number(invoice.total_amount ?? 0),
        reservationId,
        invoicePdfBuffer: Buffer.from(pdfResult.data, 'base64'),
        invoiceId: invoice.invoice_number,
        invoiceRecordId: invoice.id,
        paymentUrl,
        companyName: billingProfile?.company_header || undefined,
        replyTo: settings?.contact_email || undefined,
        customBody: settings?.email_approval_body || undefined,
        customFooter: settings?.email_footer || undefined,
    })

    if (!sendResult.success) {
        return { success: false, error: 'Failed to resend invoice email' }
    }

    if (invoice.status === 'DRAFT') {
        await supabase
            .from('invoices')
            .update({ status: 'SENT' })
            .eq('id', invoice.id)
    }

    revalidateAdminPath('/reservations')
    return { success: true, error: null as string | null }
}

/**
 * Generates regular PDF for download.
 * Returns base64 string.
 */
export async function downloadInvoicePdf(invoiceId: string) {
    await requireAdmin()
    try {
        const pdfResult = await buildInvoicePdfBuffer(invoiceId)
        if (!pdfResult.success || !pdfResult.data) {
            return { success: false, error: pdfResult.error || 'Failed to generate PDF' }
        }

        return { success: true, data: pdfResult.data.toString('base64') }
    } catch (error) {
        console.error('PDF Generation failed:', error)
        return { success: false, error: 'Failed to generate PDF' }
    }
}
