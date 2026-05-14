import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Package, Calendar, Users, TrendingUp } from 'lucide-react'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ShareWithTeam } from '@/components/onboarding/ShareWithTeam'
import { OnboardingTour } from './_components/OnboardingTour'

export default async function OrgDashboard({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const currentOrgId = user?.app_metadata?.current_org_id

    // Show invite card if this org has only 1 member (the user who just joined)
    let showInviteCard = false
    if (currentOrgId) {
        const service = createServiceClient()
        const { count } = await service
            .from('organization_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('organization_id', currentOrgId)

        showInviteCard = (count ?? 0) <= 1
    }

    return (
        <div className="space-y-6">
            {currentOrgId && (
                <OnboardingTour
                    organizationId={currentOrgId}
                    orgSlug={slug}
                />
            )}

            <AdminPageHeader
                title="Dashboard"
                description="Welcome to your workspace."
            />

            {showInviteCard && currentOrgId && (
                <ShareWithTeam organizationId={currentOrgId} />
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">--</div>
                        <p className="text-xs text-muted-foreground">Active inventory</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Rentals</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">--</div>
                        <p className="text-xs text-muted-foreground">Currently out</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Customers</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">--</div>
                        <p className="text-xs text-muted-foreground">Registered clients</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Utilization</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">--%</div>
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
                    <p className="text-sm text-muted-foreground">
                        Activity feed coming soon.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
