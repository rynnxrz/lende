import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import EvidenceUploader from '@/app/admin/reservations/[id]/EvidenceUploader'
import { ApproveButton } from '@/app/admin/reservations/ApproveButton'
import { ArchiveButton } from '@/app/admin/reservations/ArchiveButton'
import { DispatchButton } from '@/app/admin/reservations/DispatchButton'
import { FinalizeReturnButton } from '@/app/admin/reservations/FinalizeReturnButton'
import {
    ARCHIVED_STATUS,
    RESERVATION_STATUSES,
    hasRemovedAtReviewMarker,
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

export const dynamic = 'force-dynamic'

interface Props {
    params: Promise<{ slug: string; id: string }>
}

export default async function OrgRequestDetailPage(props: Props) {
    const { slug, id } = await props.params
    const basePath = `/${slug}/admin`
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const orgId = user?.app_metadata?.current_org_id as string | undefined

    const select = `
        *,
        items (name, sku, rental_price, replacement_cost, image_paths),
        profiles:profiles!reservations_renter_id_fkey (full_name, email, company_name)
    `

    let reservationQuery = supabase
        .from('reservations')
        .select(select)
        .eq('id', id)
    if (orgId) reservationQuery = reservationQuery.eq('organization_id', orgId)

    const { data: reservation, error } = await reservationQuery.single()

    if (error || !reservation) notFound()

    let groupItems: {
        created_at?: string; renter_id?: string | null; item_id?: string
        group_id?: string | null; start_date: string; end_date: string
        admin_notes?: string | null; dispatch_notes?: string | null; return_notes?: string | null
        original_start_date?: string | null; original_end_date?: string | null
        country?: string | null; city_region?: string | null
        address_line1?: string | null; address_line2?: string | null; event_location?: string | null
        items?: { name?: string; sku?: string; rental_price?: number; replacement_cost?: number; image_paths?: string[] }
        profiles?: { full_name?: string; email?: string; company_name?: string } | null
        id: string; status: string
    }[] = []

    if (reservation.group_id) {
        let siblingsQuery = supabase
            .from('reservations')
            .select(`id, created_at, group_id, renter_id, item_id, status,
                admin_notes, dispatch_notes, return_notes, start_date, end_date,
                original_start_date, original_end_date, country, city_region,
                address_line1, address_line2, event_location,
                items (name, sku, rental_price, replacement_cost, image_paths),
                profiles:profiles!reservations_renter_id_fkey (full_name, email, company_name)`)
            .eq('group_id', reservation.group_id)
            .neq('id', reservation.id)
        if (orgId) siblingsQuery = siblingsQuery.eq('organization_id', orgId)
        const { data: siblings } = await siblingsQuery

        if (siblings) {
            type SiblingRow = typeof siblings[number]
            groupItems = siblings.map((s: SiblingRow) => ({
                ...s,
                items: Array.isArray(s.items) ? s.items[0] : s.items,
                profiles: Array.isArray(s.profiles) ? s.profiles[0] : s.profiles,
            }))
        }
    }

    const allGroupItems = [reservation, ...groupItems].map(r => {
        const s = new Date(r.start_date)
        const e = new Date(r.end_date)
        const d = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
        return {
            reservationId: r.id,
            name: r.items?.name || 'Unknown',
            retailPrice: r.items?.replacement_cost || r.items?.rental_price || 0,
            days: d,
            imageUrl: r.items?.image_paths?.[0]
        }
    })

    let billingProfilesQuery = supabase
        .from('billing_profiles').select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
    if (orgId) billingProfilesQuery = billingProfilesQuery.eq('organization_id', orgId)
    const { data: billingProfiles } = await billingProfilesQuery

    let invoiceLookupQuery = supabase
        .from('invoices').select('id')
        .eq('reservation_id', reservation.id)
        .order('created_at', { ascending: false })
        .limit(1)
    if (orgId) invoiceLookupQuery = invoiceLookupQuery.eq('organization_id', orgId)
    const { data: invoice } = await invoiceLookupQuery.maybeSingle()

    const invoiceId = invoice?.id
    const customer = reservation.profiles as { full_name?: string; email?: string; company_name?: string } | null
    const isArchived = isArchivedReservation(reservation)
    const isRemovedAtReview = hasRemovedAtReviewMarker(reservation.admin_notes)
    const status = isArchived ? ARCHIVED_STATUS : normalizeLegacyReservationStatus(reservation.status)
    const statusLabel = isRemovedAtReview ? 'Unavailable' : status

    const groupKey = buildReservationGroupKey({ id: reservation.id, group_id: reservation.group_id })
    const existingAssessments = await fetchReservationGroupAssessments([groupKey])
    const assessment = existingAssessments.get(groupKey)
        || (status === RESERVATION_STATUSES.PENDING_REQUEST
            ? await ensureReservationGroupAssessment([reservation, ...groupItems].map(toAssessmentRow))
            : null)

    const isDispatchEditable = status === RESERVATION_STATUSES.UPCOMING || status === RESERVATION_STATUSES.ONGOING
    const isReturnEditable = status === RESERVATION_STATUSES.ONGOING

    return (
        <div className="max-w-5xl mx-auto py-10 px-4">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <Link href={`${basePath}/reservations`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
                        ← Back to Requests
                    </Link>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-foreground">Request #{(reservation.group_id ?? reservation.id).slice(0, 8).toUpperCase()}</h1>
                        {groupItems.length > 0 && (
                            <span className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded-full font-medium">Group Order ({groupItems.length + 1} items)</span>
                        )}
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wide
                            ${status === RESERVATION_STATUSES.PENDING_REQUEST ? 'bg-yellow-100 text-yellow-800' :
                                status === RESERVATION_STATUSES.UPCOMING ? 'bg-blue-100 text-blue-800' :
                                    status === RESERVATION_STATUSES.ONGOING ? 'bg-green-100 text-green-800' :
                                        isRemovedAtReview ? 'bg-amber-100 text-amber-800' :
                                            status === ARCHIVED_STATUS ? 'bg-purple-100 text-purple-800' :
                                                'bg-muted text-foreground'}`}>
                            {statusLabel}
                        </span>
                        {status === RESERVATION_STATUSES.PENDING_REQUEST && (
                            <ApproveButton
                                reservationId={reservation.id} startDate={reservation.start_date} endDate={reservation.end_date}
                                items={allGroupItems} customerName={customer?.full_name} customerEmail={customer?.email}
                                customerCompany={customer?.company_name}
                                customerAddress={[reservation.address_line1, reservation.address_line2, [reservation.city_region, reservation.postcode].filter(Boolean).join(', '), reservation.country].filter(Boolean)}
                                eventLocation={reservation.event_location} billingProfiles={billingProfiles || []}
                                originalStartDate={reservation.original_start_date || reservation.start_date}
                                originalEndDate={reservation.original_end_date || reservation.end_date}
                                basePath={basePath}
                            />
                        )}
                        {status === RESERVATION_STATUSES.UPCOMING && <DispatchButton reservationId={reservation.id} invoiceId={invoiceId} />}
                        {status === RESERVATION_STATUSES.PAST_LOAN && (
                            <ArchiveButton reservationId={reservation.id} groupId={reservation.group_id ?? undefined} itemCount={allGroupItems.length} />
                        )}
                        <span className="text-muted-foreground/70 text-sm">Created {format(new Date(reservation.created_at), 'PPP')}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                            Items in this Request
                            <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full font-medium">{allGroupItems.length}</span>
                        </h2>
                        <div className="space-y-3">
                            {allGroupItems.map((item, idx) => {
                                const original = idx === 0 ? reservation : groupItems[idx - 1]
                                const itemData = idx === 0 ? (reservation.items as { name?: string; rental_price?: number; sku?: string; image_paths?: string[] } | null) : groupItems[idx - 1].items
                                const itemIsArchived = isArchivedReservation(original)
                                const itemRemovedAtReview = hasRemovedAtReviewMarker(original.admin_notes)
                                const normalizedItemStatus = itemIsArchived ? ARCHIVED_STATUS : normalizeLegacyReservationStatus(original.status)
                                const itemStatusLabel = itemRemovedAtReview ? 'Unavailable' : normalizedItemStatus === ARCHIVED_STATUS ? 'Archived' : normalizedItemStatus
                                const itemStatusClass = itemRemovedAtReview ? 'bg-amber-50 text-amber-700'
                                    : normalizedItemStatus === RESERVATION_STATUSES.UPCOMING ? 'bg-blue-50 text-blue-700'
                                    : normalizedItemStatus === RESERVATION_STATUSES.ONGOING ? 'bg-green-50 text-green-700'
                                    : normalizedItemStatus === RESERVATION_STATUSES.PENDING_REQUEST ? 'bg-yellow-50 text-yellow-700'
                                    : normalizedItemStatus === ARCHIVED_STATUS ? 'bg-purple-50 text-purple-700'
                                    : 'bg-muted/50 text-muted-foreground'

                                return (
                                    <Link key={original.id} href={`${basePath}/reservations/${original.id}`} className={`flex items-start gap-4 p-3 rounded-lg border transition-all ${original.id === reservation.id ? 'bg-blue-50/50 border-blue-100 ring-1 ring-blue-100' : 'hover:bg-muted/50 border-transparent hover:border-border'}`}>
                                        <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0 border border-border">
                                            {itemData?.image_paths?.[0] ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={itemData.image_paths[0]} alt={itemData.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-muted-foreground/50 text-xs">No Img</div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-medium text-foreground truncate pr-2">{itemData?.name || 'Unknown Item'}</div>
                                                    <div className="text-xs text-muted-foreground font-mono mt-0.5">{itemData?.sku}</div>
                                                    {itemRemovedAtReview && <div className="mt-1 text-xs text-amber-700">Removed during invoice review because it was unavailable.</div>}
                                                </div>
                                                <div className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-medium flex-shrink-0 ${itemStatusClass}`}>{itemStatusLabel}</div>
                                            </div>
                                            <div className="flex items-center gap-4 mt-2 text-sm">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Dates</span>
                                                    <div className="text-foreground text-xs">{format(new Date(original.start_date), 'MMM dd')} - {format(new Date(original.end_date), 'MMM dd')}</div>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">Price</span>
                                                    <div className="text-foreground text-xs font-medium">
                                                        {typeof itemData?.rental_price === 'number' ? `£${itemData.rental_price.toFixed(2)}/day` : '£0.00/day'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    {status !== RESERVATION_STATUSES.PENDING_REQUEST && (
                        <EvidenceUploader reservationId={reservation.id} type="dispatch" existingImages={reservation.dispatch_image_paths} notes={reservation.dispatch_notes} readOnly={!isDispatchEditable} />
                    )}

                    {(status === RESERVATION_STATUSES.ONGOING || status === RESERVATION_STATUSES.PAST_LOAN) && (
                        <div className="space-y-4">
                            <EvidenceUploader reservationId={reservation.id} type="return" existingImages={reservation.return_image_paths} notes={reservation.return_notes} readOnly={!isReturnEditable} />
                            {status === RESERVATION_STATUSES.ONGOING && (
                                <div className="flex justify-end pt-4 border-t border-border">
                                    <FinalizeReturnButton reservationId={reservation.id} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    {assessment && (
                        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="font-semibold text-foreground">Intake Assessment</h2>
                                    <p className="text-xs text-muted-foreground mt-1">Snapshot generated {format(new Date(assessment.generatedAt), 'PPP p')}</p>
                                </div>
                                <div className="flex flex-wrap justify-end gap-2">
                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-wide ${priorityPillClass(assessment.priorityBand)}`}>{assessment.priorityBand} · {assessment.priorityScore}</span>
                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-wide ${valueTierPillClass(assessment.valueTier)}`}>{assessment.valueTier}</span>
                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-wide ${feasibilityPillClass(assessment.feasibilityStatus)}`}>{assessment.feasibilityStatus.replace('_', ' ')}</span>
                                </div>
                            </div>
                            <div className="mt-5 space-y-5 text-sm">
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Risk Assessment</h3>
                                    <div className="mt-2 space-y-2 text-foreground">{assessment.snapshot.riskAssessment.map((line, i) => <p key={`risk-${i}`}>{line}</p>)}</div>
                                </section>
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Feasibility Check</h3>
                                    <div className="mt-2 space-y-2 text-foreground">{assessment.snapshot.feasibilityCheck.map((line, i) => <p key={`feas-${i}`}>{line}</p>)}</div>
                                </section>
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Value Tier</h3>
                                    <p className="mt-2 text-foreground">{assessment.snapshot.customerSummary || 'Request overview pending.'}</p>
                                </section>
                                <section>
                                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recommended Next Step</h3>
                                    <p className="mt-2 text-foreground">{assessment.recommendedNextStep}</p>
                                </section>
                            </div>
                        </div>
                    )}

                    <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                        <h2 className="font-semibold text-foreground mb-4">Customer Info</h2>
                        <div className="space-y-3 text-sm">
                            <div><label className="block text-muted-foreground text-xs uppercase tracking-wide">Name</label><div className="font-medium">{customer?.full_name || 'N/A'}</div></div>
                            <div><label className="block text-muted-foreground text-xs uppercase tracking-wide">Company</label><div className="font-medium">{customer?.company_name || 'N/A'}</div></div>
                            <div>
                                <label className="block text-muted-foreground text-xs uppercase tracking-wide">Address</label>
                                <div className="font-medium text-foreground mt-1">
                                    {(reservation.address_line1 || reservation.city_region) ? (
                                        <><p>{reservation.address_line1}{reservation.address_line2 ? `, ${reservation.address_line2}` : ''}</p><p>{reservation.city_region}{reservation.postcode ? `, ${reservation.postcode}` : ''}</p><p>{reservation.country}</p></>
                                    ) : (<p className="text-muted-foreground/70 italic">No address provided</p>)}
                                </div>
                            </div>
                            <div><label className="block text-muted-foreground text-xs uppercase tracking-wide">Email</label><a href={`mailto:${customer?.email}`} className="text-blue-600 hover:underline">{customer?.email}</a></div>
                        </div>
                    </div>

                    <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                        <h2 className="font-semibold text-foreground mb-4">Timeline</h2>
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="flex-1"><label className="block text-muted-foreground text-xs uppercase tracking-wide mb-1">Start</label><div className="font-medium bg-muted/50 p-2 rounded">{format(new Date(reservation.start_date), 'MMM dd')}</div></div>
                                <div className="flex-1"><label className="block text-muted-foreground text-xs uppercase tracking-wide mb-1">End</label><div className="font-medium bg-muted/50 p-2 rounded">{format(new Date(reservation.end_date), 'MMM dd, yyyy')}</div></div>
                            </div>
                            <div className="pt-2"><label className="block text-muted-foreground text-xs uppercase tracking-wide mb-1">Notes</label><p className="text-sm text-muted-foreground italic">{reservation.notes || 'No notes provided.'}</p></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function toAssessmentRow(row: Record<string, unknown>): ReservationAssessmentRow {
    const itemRecord = row.items && typeof row.items === 'object' && !Array.isArray(row.items) ? row.items as Record<string, unknown> : null
    const profileRecord = row.profiles && typeof row.profiles === 'object' && !Array.isArray(row.profiles) ? row.profiles as Record<string, unknown> : null
    return {
        id: String(row.id), group_id: typeof row.group_id === 'string' ? row.group_id : null,
        renter_id: typeof row.renter_id === 'string' ? row.renter_id : null,
        item_id: String(row.item_id), status: typeof row.status === 'string' ? row.status : null,
        start_date: String(row.start_date), end_date: String(row.end_date),
        created_at: typeof row.created_at === 'string' ? row.created_at : null,
        country: typeof row.country === 'string' ? row.country : null,
        city_region: typeof row.city_region === 'string' ? row.city_region : null,
        address_line1: typeof row.address_line1 === 'string' ? row.address_line1 : null,
        address_line2: typeof row.address_line2 === 'string' ? row.address_line2 : null,
        event_location: typeof row.event_location === 'string' ? row.event_location : null,
        dispatch_notes: typeof row.dispatch_notes === 'string' ? row.dispatch_notes : null,
        admin_notes: typeof row.admin_notes === 'string' ? row.admin_notes : null,
        return_notes: typeof row.return_notes === 'string' ? row.return_notes : null,
        original_start_date: typeof row.original_start_date === 'string' ? row.original_start_date : null,
        original_end_date: typeof row.original_end_date === 'string' ? row.original_end_date : null,
        items: itemRecord ? { name: typeof itemRecord.name === 'string' ? itemRecord.name : null, sku: typeof itemRecord.sku === 'string' ? itemRecord.sku : null, rental_price: typeof itemRecord.rental_price === 'number' ? itemRecord.rental_price : null, replacement_cost: typeof itemRecord.replacement_cost === 'number' ? itemRecord.replacement_cost : null } : null,
        profiles: profileRecord ? { full_name: typeof profileRecord.full_name === 'string' ? profileRecord.full_name : null, email: typeof profileRecord.email === 'string' ? profileRecord.email : null, company_name: typeof profileRecord.company_name === 'string' ? profileRecord.company_name : null } : null,
    }
}

function priorityPillClass(band: ReservationGroupAssessment['priorityBand']) {
    return band === 'urgent' ? 'bg-rose-100 text-rose-700' : band === 'high' ? 'bg-amber-100 text-amber-700' : band === 'standard' ? 'bg-sky-100 text-sky-700' : 'bg-muted text-muted-foreground'
}
function valueTierPillClass(tier: ReservationGroupAssessment['valueTier']) {
    return tier === 'vip' ? 'bg-fuchsia-100 text-fuchsia-700' : tier === 'high' ? 'bg-violet-100 text-violet-700' : tier === 'standard' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
}
function feasibilityPillClass(fs: ReservationGroupAssessment['feasibilityStatus']) {
    return fs === 'high_risk' ? 'bg-rose-100 text-rose-700' : fs === 'watch' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
}
