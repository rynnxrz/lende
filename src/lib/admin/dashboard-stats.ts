import type { SupabaseClient } from '@supabase/supabase-js'

export type DashboardStats = {
    totalItems: number
    maintenanceItemsCount: number
    activeRentals: number
    customerCount: number
    utilizationPct: number | null
}

export type RecentActivityRow = {
    id: string
    status: string | null
    createdAt: string
    itemName: string | null
    imagePath: string | null
    customerName: string | null
}

type JoinedItem = { name: string | null; image_paths: string[] | null } | null
type JoinedProfile = { full_name: string | null; email: string | null } | null

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

export async function getDashboardStats(
    supabase: SupabaseClient,
    orgId: string,
): Promise<{ stats: DashboardStats; recentActivity: RecentActivityRow[] }> {
    const [
        totalItemsResult,
        nonRetiredItemsResult,
        maintenanceItemsResult,
        activeRentalsResult,
        customerRowsResult,
        recentActivityResult,
    ] = await Promise.all([
        supabase.from('items').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
        supabase.from('items').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).neq('status', 'retired'),
        supabase.from('items').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'maintenance'),
        supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active'),
        supabase.from('reservations').select('renter_id').eq('organization_id', orgId).not('renter_id', 'is', null),
        supabase
            .from('reservations')
            .select('id, status, created_at, items(name, image_paths), profiles:profiles!reservations_renter_id_fkey(full_name, email)')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(8),
    ])

    const totalItems = totalItemsResult.count ?? 0
    const nonRetiredItems = nonRetiredItemsResult.count ?? 0
    const maintenanceItemsCount = maintenanceItemsResult.count ?? 0
    const activeRentals = activeRentalsResult.count ?? 0

    const customerCount = new Set(
        (customerRowsResult.data ?? []).map((row) => row.renter_id).filter(Boolean),
    ).size

    const utilizationPct = nonRetiredItems > 0
        ? Math.round((activeRentals / nonRetiredItems) * 100)
        : null

    const recentActivity: RecentActivityRow[] = (recentActivityResult.data ?? []).map((row) => {
        const item = firstOrSelf<NonNullable<JoinedItem>>(row.items)
        const profile = firstOrSelf<NonNullable<JoinedProfile>>(row.profiles)

        return {
            id: row.id,
            status: row.status,
            createdAt: row.created_at,
            itemName: item?.name ?? null,
            imagePath: item?.image_paths?.[0] ?? null,
            customerName: profile?.full_name || profile?.email || null,
        }
    })

    return {
        stats: { totalItems, maintenanceItemsCount, activeRentals, customerCount, utilizationPct },
        recentActivity,
    }
}
