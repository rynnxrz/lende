import { redirect } from 'next/navigation'
import { TeamClient } from '@/app/admin/team/team-client'
import { getOrgAdminContext } from '@/lib/admin/org-context'
import { withServerTiming } from '@/lib/admin/perf'
import { TopLoaderReady } from '@/components/TopLoaderReady'

export const dynamic = 'force-dynamic'

export default async function OrgTeamPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const { service, org, member } = await getOrgAdminContext(slug)
    const membership = { organization_id: org.id, role: member.role }

    if (!membership || !['owner', 'admin'].includes(membership.role)) redirect('/')

    const { data: members } = await withServerTiming('team:members', async () => await service
        .from('organization_members').select('user_id, role, accepted_at')
        .eq('organization_id', membership.organization_id))

    const memberRows = (members ?? []) as Array<{ user_id: string; role: string; accepted_at: string | null }>

    const [{ data: profiles }, { data: invitations }] = await withServerTiming('team:profiles-and-invitations', () => Promise.all([
        service
            .from('profiles')
            .select('id, email')
            .in('id', memberRows.map(m => m.user_id)),
        service
            .from('organization_invitations')
            .select('id, email, role, created_at, expires_at, accepted_at')
            .eq('organization_id', membership.organization_id)
            .is('accepted_at', null)
            .order('created_at', { ascending: false }),
    ]))

    const emailByUserId = new Map((profiles ?? []).map(p => [p.id, p.email]))
    const memberDetails = memberRows.map(m => ({
        userId: m.user_id,
        email: emailByUserId.get(m.user_id) ?? 'unknown',
        role: m.role,
        joinedAt: m.accepted_at,
    }))

    return (
        <>
            <TopLoaderReady />
            <TeamClient
                organizationId={membership.organization_id}
                members={memberDetails}
                invitations={(invitations ?? []).map(inv => ({
                    id: inv.id, email: inv.email, role: inv.role,
                    createdAt: inv.created_at, expiresAt: inv.expires_at,
                    expired: new Date(inv.expires_at) < new Date(),
                }))}
            />
        </>
    )
}
