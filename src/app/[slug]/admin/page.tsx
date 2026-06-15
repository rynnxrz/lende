import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Package, Calendar, Users, TrendingUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ShareWithTeam } from '@/components/onboarding/ShareWithTeam'
import { TopLoaderReady } from '@/components/TopLoaderReady'
import { OnboardingTour } from './_components/OnboardingTour'
import { getOrgAdminContext } from '@/lib/admin/org-context'
import { withServerTiming } from '@/lib/admin/perf'
import { getDashboardStats } from '@/lib/admin/dashboard-stats'
import { normalizeLegacyReservationStatus, RESERVATION_STATUS_BADGE_STYLES } from '@/lib/constants/reservation-status'

export default async function OrgDashboard({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const { supabase, service, org } = await getOrgAdminContext(slug)
    const orgId = org.id

    const [{ stats, recentActivity }, memberCountResult] = await withServerTiming('dashboard:stats', () =>
        Promise.all([
            getDashboardStats(supabase, orgId),
            service
                .from('organization_members')
                .select('user_id', { count: 'exact', head: true })
                .eq('organization_id', orgId),
        ])
    )

    // Show invite card if this org has only 1 member (the user who just joined)
    const showInviteCard = (memberCountResult.count ?? 0) <= 1

    return (
        <div className="space-y-6">
            <TopLoaderReady />
            <OnboardingTour
                organizationId={orgId}
                orgSlug={slug}
            />

            <AdminPageHeader
                title="Dashboard"
                description="Welcome to your workspace."
            />

            {showInviteCard && (
                <ShareWithTeam organizationId={orgId} />
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalItems}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.maintenanceItemsCount > 0
                                ? `${stats.maintenanceItemsCount} in maintenance`
                                : 'Active inventory'}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Rentals</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activeRentals}</div>
                        <p className="text-xs text-muted-foreground">Currently out</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Customers</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.customerCount}</div>
                        <p className="text-xs text-muted-foreground">Registered clients</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Utilization</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats.utilizationPct === null ? '--' : `${stats.utilizationPct}%`}
                        </div>
                        <p className="text-xs text-muted-foreground">Inventory usage rate</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Latest reservations and status updates</CardDescription>
                </CardHeader>
                <CardContent>
                    {recentActivity.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No activity yet. Reservations will appear here once customers start booking.
                        </p>
                    ) : (
                        <ul className="space-y-3">
                            {recentActivity.map((activity) => {
                                const statusLabel = normalizeLegacyReservationStatus(activity.status)
                                return (
                                    <li key={activity.id} className="flex items-center gap-3">
                                        {activity.imagePath ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={activity.imagePath}
                                                alt={activity.itemName ?? ''}
                                                className="h-10 w-10 rounded border border-border object-cover"
                                            />
                                        ) : (
                                            <div className="h-10 w-10 rounded border border-border bg-muted" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{activity.itemName ?? 'Unknown item'}</p>
                                            <p className="truncate text-xs text-muted-foreground">{activity.customerName ?? 'Guest'}</p>
                                        </div>
                                        <Badge variant="outline" className={RESERVATION_STATUS_BADGE_STYLES[statusLabel]}>
                                            {statusLabel}
                                        </Badge>
                                        <span className="whitespace-nowrap text-xs text-muted-foreground/70">
                                            {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
