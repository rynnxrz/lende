import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamClient } from './team-client'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const service = createServiceClient()

    // Find user's org membership (use current_org from app_metadata or first membership)
    const orgId = user.app_metadata?.current_org_id as string | undefined

    const { data: membership } = orgId
        ? await service
            .from('organization_members')
            .select('organization_id, role')
            .eq('organization_id', orgId)
            .eq('user_id', user.id)
            .single()
        : await service
            .from('organization_members')
            .select('organization_id, role')
            .eq('user_id', user.id)
            .limit(1)
            .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
        redirect('/')
    }

    // Fetch members
    const { data: members } = await service
        .from('organization_members')
        .select('user_id, role, accepted_at')
        .eq('organization_id', membership.organization_id)

    // Resolve member emails from auth
    const memberDetails = await Promise.all(
        (members ?? []).map(async (m) => {
            const { data: { user: memberUser } } = await service.auth.admin.getUserById(m.user_id)
            return {
                userId: m.user_id,
                email: memberUser?.email ?? 'unknown',
                role: m.role,
                joinedAt: m.accepted_at,
            }
        })
    )

    // Fetch pending invitations
    const { data: invitations } = await service
        .from('organization_invitations')
        .select('id, email, role, created_at, expires_at, accepted_at')
        .eq('organization_id', membership.organization_id)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })

    return (
        <TeamClient
            organizationId={membership.organization_id}
            members={memberDetails}
            invitations={(invitations ?? []).map(inv => ({
                id: inv.id,
                email: inv.email,
                role: inv.role,
                createdAt: inv.created_at,
                expiresAt: inv.expires_at,
                expired: new Date(inv.expires_at) < new Date(),
            }))}
        />
    )
}
