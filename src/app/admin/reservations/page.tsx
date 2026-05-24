import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import Link from 'next/link'
import { ApproveButton } from './ApproveButton'
import { ArchiveButton } from './ArchiveButton'
import { DispatchButton } from './DispatchButton'
import { UpcomingInvoiceActions } from './UpcomingInvoiceActions'
import { FinalizeReturnButton } from './FinalizeReturnButton'
import { InvoiceViewButton } from './InvoiceViewButton'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { FileCheck } from 'lucide-react'
import { ImportRequestButton } from './ImportRequestButton'
import { RealtimeReservationsListener } from './RealtimeReservationsListener'
import {
    ARCHIVED_STATUS,
    RESERVATION_STATUSES,
    isArchivedReservation,
    normalizeLegacyReservationStatus,
} from '@/lib/constants/reservation-status'
import {
    buildReservationGroupKey,
    ensureReservationGroupAssessment,
    fetchReservationGroupAssessments,
    type ReservationAssessmentRow,
    type ReservationGroupAssessment,
} from '@/lib/reservations/assessment'
import { fetchPrestigeAssessments } from '@/lib/reservations/prestige-store'
import { PrestigeBadge } from './PrestigeBadge'
import type { PersistedPrestige } from '@/lib/reservations/prestige-agent'
import type { BillingProfile } from '@/types'
import { computeRentalChargeFromRetail } from '@/lib/invoice/pricing'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams: Promise<{ filter?: string; customer?: string; sort?: string }>
}

const STATUS_FILTERS = {
    pending_request: RESERVATION_STATUSES.PENDING_REQUEST,
    upcoming: RESERVATION_STATUSES.UPCOMING,
    ongoing: RESERVATION_STATUSES.ONGOING,
    past_loan: RESERVATION_STATUSES.PAST_LOAN,
} as const

export default async function AdminReservationsPage({ searchParams }: PageProps) {
    const resolvedSearchParams = await searchParams
    const filter = resolvedSearchParams.filter || 'pending_request'
    const customerEmail = resolvedSearchParams.customer
    const sortMode = resolvedSearchParams.sort === 'prestige' ? 'prestige' : 'default'

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') redirect('/')

    let query = supabase
        .from('reservations')
        .select(`
            *,
            items (name, sku, rental_price, replacement_cost, image_paths),
            profiles:renter_id (full_name, email, company_name)
        `)
        .order('created_at', { ascending: false })

    // Fetch billing profiles for invoice generation
    const { data: billingProfiles } = await supabase
        .from('billing_profiles')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })

    // Apply status filter (unless filtering by customer - show all for customer)
    if (!customerEmail && filter !== 'archived') {
        const status = STATUS_FILTERS[filter as keyof typeof STATUS_FILTERS]
        if (status) {
            query = query.eq('status', status)
        }
    }

    const { data: reservations, error } = await query

    // Filter by customer email if provided
    const baseReservations = customerEmail
        ? (reservations || []).filter(r => r.profiles?.email === customerEmail)
        : (reservations || [])

    const filteredReservations = baseReservations.filter((reservation) => {
        if (customerEmail) return true

        const reservationIsArchived = isArchivedReservation(reservation)

        if (filter === 'archived') {
            return reservationIsArchived
        }

        if (reservationIsArchived) return false

        if (filter === 'past_loan') {
            return (
                normalizeLegacyReservationStatus(reservation.status) === RESERVATION_STATUSES.PAST_LOAN
            )
        }

        const status = STATUS_FILTERS[filter as keyof typeof STATUS_FILTERS]
        if (!status) return true

        return normalizeLegacyReservationStatus(reservation.status) === status
    })

    // Grouping Logic
    const groups: Record<string, NonNullable<typeof filteredReservations>> = {}

        ; (filteredReservations || []).forEach(r => {
            // If no group_id, treat as unique group using its own ID
            const key = r.group_id || r.id
            if (!groups[key]) {
                groups[key] = []
            }
            groups[key].push(r)
        })

    const baseSortedGroups = Object.values(groups).sort((a, b) => {
        const latestA = Math.max(...a.map(i => new Date(i.created_at).getTime()))
        const latestB = Math.max(...b.map(i => new Date(i.created_at).getTime()))
        return latestB - latestA
    })

    const groupKeys = baseSortedGroups.map(group => buildReservationGroupKey(group[0]))
    const [assessments, prestigeMap] = await Promise.all([
        fetchReservationGroupAssessments(groupKeys),
        fetchPrestigeAssessments(groupKeys),
    ])

    if (filter === 'pending_request') {
        await Promise.all(baseSortedGroups.map(async (group) => {
            const primary = group[0]
            if (!primary) return

            const groupKey = buildReservationGroupKey(primary)
            if (assessments.has(groupKey)) return

            const assessment = await ensureReservationGroupAssessment(group.map(toAssessmentRow))
            if (assessment) {
                assessments.set(groupKey, assessment)
            }
        }))
    }

    const sortedGroups = [...baseSortedGroups].sort((left, right) => {
        if (filter !== 'pending_request') {
            return 0
        }

        if (sortMode === 'prestige') {
            const leftPrestige = prestigeMap.get(buildReservationGroupKey(left[0]))
            const rightPrestige = prestigeMap.get(buildReservationGroupKey(right[0]))
            // nulls last
            if (!leftPrestige && rightPrestige) return 1
            if (leftPrestige && !rightPrestige) return -1
            const leftScore = leftPrestige?.prestige_score ?? -1
            const rightScore = rightPrestige?.prestige_score ?? -1
            if (rightScore !== leftScore) {
                return rightScore - leftScore
            }
        } else {
            const leftAssessment = assessments.get(buildReservationGroupKey(left[0]))
            const rightAssessment = assessments.get(buildReservationGroupKey(right[0]))
            const leftScore = leftAssessment?.priorityScore || 0
            const rightScore = rightAssessment?.priorityScore || 0

            if (rightScore !== leftScore) {
                return rightScore - leftScore
            }
        }

        const latestLeft = Math.max(...left.map(item => new Date(item.created_at).getTime()))
        const latestRight = Math.max(...right.map(item => new Date(item.created_at).getTime()))
        return latestRight - latestLeft
    })

    if (error) {
        console.error('Error fetching reservations:', error)
        return (
            <div className="text-red-500">
                Error loading reservations: {error.message}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <RealtimeReservationsListener />
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-semibold text-foreground">Reservations</h1>
                        <ImportRequestButton />
                    </div>
                    {customerEmail && (
                        <p className="text-sm text-muted-foreground mt-1">
                            Filtered by: <span className="font-medium">{customerEmail}</span>
                            <Link href="/admin/reservations" className="ml-2 text-blue-600 hover:underline">
                                Clear filter
                            </Link>
                        </p>
                    )}
                </div>

                <div className="flex p-1 bg-muted rounded-lg">
                    <FilterTab
                        label="Pending Request"
                        active={filter === 'pending_request'}
                        href="/admin/reservations?filter=pending_request"
                    />
                    <FilterTab
                        label="Upcoming"
                        active={filter === 'upcoming'}
                        href="/admin/reservations?filter=upcoming"
                    />
                    <FilterTab
                        label="Ongoing"
                        active={filter === 'ongoing'}
                        href="/admin/reservations?filter=ongoing"
                    />
                    <FilterTab
                        label="Past-loan"
                        active={filter === 'past_loan'}
                        href="/admin/reservations?filter=past_loan"
                    />
                    <FilterTab
                        label="Archived"
                        active={filter === 'archived'}
                        href="/admin/reservations?filter=archived"
                    />
                </div>
            </div>

            {filter === 'pending_request' && (
                <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">Sort:</span>
                    <Link
                        href="/admin/reservations?filter=pending_request"
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                            sortMode !== 'prestige'
                                ? 'bg-primary text-white'
                                : 'bg-muted text-muted-foreground hover:bg-muted'
                        }`}
                    >
                        Priority score
                    </Link>
                    <Link
                        href="/admin/reservations?filter=pending_request&sort=prestige"
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                            sortMode === 'prestige'
                                ? 'bg-primary text-white'
                                : 'bg-muted text-muted-foreground hover:bg-muted'
                        }`}
                    >
                        Prestige
                    </Link>
                </div>
            )}

            <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
                <ReservationsTable
                    groups={sortedGroups}
                    billingProfiles={billingProfiles || []}
                    assessments={assessments}
                    prestigeMap={prestigeMap}
                />
            </div>
        </div>
    )
}

function FilterTab({ label, active, href }: { label: string, active: boolean, href: string }) {
    return (
        <Link
            href={href}
            className={`
                px-4 py-2 text-sm font-medium rounded-md transition-all
                ${active
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }
            `}
        >
            {label}
        </Link>
    )
}

type ReservationGroup = {
    id: string
    item_id: string
    renter_id?: string | null
    status: string
    admin_notes?: string | null
    dispatch_notes?: string | null
    return_notes?: string | null
    start_date: string
    end_date: string
    original_start_date?: string | null
    original_end_date?: string | null
    created_at: string
    group_id: string | null
    event_location?: string | null
    city_region?: string | null
    country?: string | null
    address_line1?: string | null
    address_line2?: string | null
    items?: { name?: string; sku?: string; image_paths?: string[]; rental_price?: number; replacement_cost?: number }
    profiles?: { full_name?: string; email?: string; company_name?: string }
    shipping?: { status?: string }
    billing_profile_id?: string | null
}[]

function ReservationsTable({
    groups,
    billingProfiles,
    assessments,
    prestigeMap,
}: {
    groups: ReservationGroup[]
    billingProfiles: BillingProfile[]
    assessments: Map<string, ReservationGroupAssessment>
    prestigeMap: Map<string, PersistedPrestige | null>
}) {
    if (groups.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground/70">
                No reservations found.
            </div>
        )
    }

    return (
        <Table>
            <TableHeader>
                <TableRow className="bg-muted/50">
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>AI Intake</TableHead>
                    <TableHead>Prestige</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {groups.map((group) => {
                    const primary = group[0] // Use first item for common details
                    if (!primary) return null

                    const status = isArchivedReservation(primary)
                        ? ARCHIVED_STATUS
                        : normalizeLegacyReservationStatus(primary.status)
                    const groupKey = buildReservationGroupKey(primary)
                    const assessment = assessments.get(groupKey)
                    const prestige = prestigeMap.get(groupKey) ?? null
                    // For status: simplified assumption that group shares status.
                    // Make sure to display something reasonable if mixed, though normally they should sync.

                    const start = new Date(primary.start_date)
                    const end = new Date(primary.end_date)

                    // Specific calculation per item to be accurate
                    let groupTotal = 0
                        const approveItems = group.map(r => {
                            const s = new Date(r.start_date)
                            const e = new Date(r.end_date)
                            const d = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
                            const retailPrice = r.items?.replacement_cost || r.items?.rental_price || 0
                        groupTotal += computeRentalChargeFromRetail({
                            retailPrice,
                            rentalDays: d,
                            })
                            return {
                                reservationId: r.id,
                                name: r.items?.name || 'Unknown',
                                retailPrice,
                                days: d,
                                imageUrl: r.items?.image_paths?.[0]
                            }
                    })

                    // Check if multiple items
                    const isGroup = group.length > 1

                    return (
                        <TableRow key={primary.id} className="group">
                            <TableCell className="align-top">
                                <StatusBadge status={status} />
                                <div className="text-xs text-muted-foreground/70 mt-2 font-mono">
                                    {format(new Date(primary.created_at), 'MMM dd')}
                                </div>
                                {isGroup && (
                                    <div className="mt-1">
                                        <Badge variant="secondary" className="text-[10px] px-1 h-5">
                                            {group.length} ITEMS
                                        </Badge>
                                    </div>
                                )}
                            </TableCell>
                            <TableCell className="align-top">
                                <Link href={`/admin/reservations/${primary.id}`} className="block hover:bg-muted/50 -m-2 p-2 rounded transition-colors">
                                    {isGroup ? (
                                        <div className="flex flex-wrap gap-2">
                                            {group.map((item) => (
                                                <div key={item.id} className="relative group/item" title={item.items?.name}>
                                                    {item.items?.image_paths?.[0] ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={item.items.image_paths[0]}
                                                            alt={item.items.name}
                                                            className="w-10 h-10 object-cover rounded border border-border"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 bg-muted rounded border border-border flex items-center justify-center text-[10px] text-muted-foreground/70">
                                                            N/A
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            <div className="w-full text-xs font-medium text-foreground mt-1">
                                                {primary.items?.name} <span className="text-muted-foreground/70 font-normal">+ {group.length - 1} more</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="font-medium text-foreground hover:text-blue-600 transition-colors">
                                                {primary.items?.name || 'Unknown Item'}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1 font-mono tracking-wide">
                                                {primary.items?.sku}
                                            </div>
                                        </>
                                    )}
                                </Link>
                            </TableCell>
                            <TableCell className="align-top">
                                <div className="text-foreground font-medium text-sm">
                                    {primary.profiles?.full_name || primary.profiles?.email || 'Guest'}
                                </div>
                                {primary.profiles?.company_name && (
                                    <div className="text-xs text-indigo-600 mt-0.5 font-medium">
                                        {primary.profiles.company_name}
                                    </div>
                                )}
                                <div className="text-xs text-muted-foreground/70 mt-1">
                                    {primary.profiles?.email}
                                </div>
                            </TableCell>
                            <TableCell className="align-top">
                                <div className="text-foreground text-sm">
                                    {primary.city_region && primary.country ? (
                                        <span>{primary.city_region}, {primary.country}</span>
                                    ) : (
                                        <span className="text-muted-foreground/70 italic">No Location</span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="align-top">
                                <div className="flex flex-col gap-1 text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground/70 w-8">OUT</span>
                                        <span className="font-medium bg-muted px-1.5 py-0.5 rounded text-foreground">
                                            {format(start, 'MMM dd')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground/70 w-8">IN</span>
                                        <span className="font-medium bg-muted px-1.5 py-0.5 rounded text-foreground">
                                            {format(end, 'MMM dd')}
                                        </span>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="align-top">
                                {assessment ? (
                                    <div className="space-y-2 text-xs">
                                        <div className="flex flex-wrap gap-1.5">
                                            <Badge variant="outline" className={priorityBadgeClass(assessment.priorityBand)}>
                                                {assessment.priorityBand.toUpperCase()} · {assessment.priorityScore}
                                            </Badge>
                                            <Badge variant="outline" className={valueTierBadgeClass(assessment.valueTier)}>
                                                {assessment.valueTier.toUpperCase()}
                                            </Badge>
                                            <Badge variant="outline" className={feasibilityBadgeClass(assessment.feasibilityStatus)}>
                                                {assessment.feasibilityStatus.replace('_', ' ')}
                                            </Badge>
                                        </div>
                                        <div className="space-y-1 text-muted-foreground">
                                            {assessment.reasons.slice(0, 2).map((reason, index) => (
                                                <p key={`${assessment.groupKey}-reason-${index}`}>{reason}</p>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-xs text-muted-foreground/70">Assessment pending</span>
                                )}
                            </TableCell>
                            <TableCell className="align-top">
                                <PrestigeBadge
                                    prestige={prestige}
                                    groupKey={groupKey}
                                    primaryReservationId={primary.id}
                                />
                            </TableCell>
                            <TableCell className="align-top text-right font-medium text-foreground text-sm">
                                £{groupTotal.toFixed(2)}
                            </TableCell>
                            <TableCell className="align-top text-right">
                                <div className="flex items-center justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                                    {status === RESERVATION_STATUSES.PENDING_REQUEST && (
                                        <ApproveButton
                                            reservationId={primary.id}
                                            startDate={primary.start_date}
                                            endDate={primary.end_date}
                                            // Group props
                                            items={approveItems}
                                            // Common customer info
                                            customerName={primary.profiles?.full_name}
                                            customerEmail={primary.profiles?.email}
                                            customerCompany={primary.profiles?.company_name}
                                            eventLocation={primary.event_location}
                                            billingProfiles={billingProfiles}
                                            originalStartDate={primary.original_start_date || primary.start_date}
                                            originalEndDate={primary.original_end_date || primary.end_date}
                                        />
                                    )}
                                    {status === RESERVATION_STATUSES.UPCOMING && (
                                        <>
                                            <UpcomingInvoiceActions reservationId={primary.id} />
                                            <DispatchButton reservationId={primary.id} />
                                        </>
                                    )}
                                    {status === RESERVATION_STATUSES.ONGOING && (
                                        <>
                                            <InvoiceViewButton reservationId={primary.id} />
                                            <FinalizeReturnButton reservationId={primary.id} label="Confirm Return" compact />
                                        </>
                                    )}
                                    {status === RESERVATION_STATUSES.PAST_LOAN && (
                                        <>
                                            <InvoiceViewButton reservationId={primary.id} />
                                            <ArchiveButton
                                                reservationId={primary.id}
                                                groupId={primary.group_id ?? undefined}
                                                itemCount={group.length}
                                            />
                                        </>
                                    )}
                                    {status === ARCHIVED_STATUS && (
                                        <InvoiceViewButton reservationId={primary.id} />
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    )
                })}
            </TableBody>
        </Table>
    )
}

function toAssessmentRow(row: ReservationGroup[number]): ReservationAssessmentRow {
    return {
        id: row.id,
        group_id: row.group_id,
        renter_id: row.renter_id || null,
        item_id: row.item_id,
        status: row.status,
        start_date: row.start_date,
        end_date: row.end_date,
        created_at: row.created_at,
        country: row.country || null,
        city_region: row.city_region || null,
        address_line1: row.address_line1 || null,
        address_line2: row.address_line2 || null,
        event_location: row.event_location || null,
        dispatch_notes: row.dispatch_notes || null,
        admin_notes: row.admin_notes || null,
        return_notes: row.return_notes || null,
        original_start_date: row.original_start_date || null,
        original_end_date: row.original_end_date || null,
        items: row.items || null,
        profiles: row.profiles || null,
    }
}

function priorityBadgeClass(priorityBand: ReservationGroupAssessment['priorityBand']) {
    switch (priorityBand) {
        case 'urgent':
            return 'border-rose-200 bg-rose-50 text-rose-700'
        case 'high':
            return 'border-amber-200 bg-amber-50 text-amber-700'
        case 'standard':
            return 'border-sky-200 bg-sky-50 text-sky-700'
        default:
            return 'border-border bg-muted/50 text-muted-foreground'
    }
}

function valueTierBadgeClass(valueTier: ReservationGroupAssessment['valueTier']) {
    switch (valueTier) {
        case 'vip':
            return 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
        case 'high':
            return 'border-violet-200 bg-violet-50 text-violet-700'
        case 'standard':
            return 'border-emerald-200 bg-emerald-50 text-emerald-700'
        default:
            return 'border-border bg-muted/50 text-muted-foreground'
    }
}

function feasibilityBadgeClass(feasibilityStatus: ReservationGroupAssessment['feasibilityStatus']) {
    switch (feasibilityStatus) {
        case 'high_risk':
            return 'border-rose-200 bg-rose-50 text-rose-700'
        case 'watch':
            return 'border-amber-200 bg-amber-50 text-amber-700'
        default:
            return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    }
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        [RESERVATION_STATUSES.PENDING_REQUEST]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        [RESERVATION_STATUSES.UPCOMING]: 'bg-blue-100 text-blue-800 border-blue-200',
        [RESERVATION_STATUSES.ONGOING]: 'bg-green-100 text-green-800 border-green-200',
        [RESERVATION_STATUSES.PAST_LOAN]: 'bg-muted text-foreground border-border',
        [ARCHIVED_STATUS]: 'bg-purple-100 text-purple-800 border-purple-200',
    }

    const labels: Record<string, string> = {
        [RESERVATION_STATUSES.PENDING_REQUEST]: 'Pending Request',
        [RESERVATION_STATUSES.UPCOMING]: 'Upcoming',
        [RESERVATION_STATUSES.ONGOING]: 'Ongoing',
        [RESERVATION_STATUSES.PAST_LOAN]: 'Past-loan',
        [ARCHIVED_STATUS]: 'Archived',
    }

    const style = styles[status] || 'bg-muted text-foreground border-border'
    const label = labels[status] || status

    return (
        <div className="flex flex-col gap-1">
            <Badge variant="outline" className={`${style} text-xs`}>
                {label}
            </Badge>
            {status === RESERVATION_STATUSES.UPCOMING && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-600" title="Invoice Sent">
                    <FileCheck className="h-3 w-3" />
                    Invoice Sent
                </span>
            )}
        </div>
    )
}
