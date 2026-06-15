import { cache } from 'react'
import { redirect } from 'next/navigation'

import { createClient, createServiceClient } from '@/lib/supabase/server'

export type OrgMembership = {
    organization_id: string
    role: string
    organizations: { id: string; slug: string; name: string } | null
}

export const getOrgAdminContext = cache(async (slug: string) => {
    const normalizedSlug = decodeURIComponent(slug).toLowerCase()
    const supabase = await createClient()
    const service = createServiceClient()

    // getUser() and the org lookup are independent — run them together so
    // the round trip happens once, not twice in sequence.
    const [{ data: { user } }, { data: org }] = await Promise.all([
        supabase.auth.getUser(),
        service.from('organizations').select('id, slug, name').eq('slug', normalizedSlug).maybeSingle(),
    ])

    if (!user) redirect('/login')
    if (!org) redirect('/')

    // Membership for this org and the user's full membership list (for the
    // Sidebar OrgSwitcher) both only depend on user.id/org.id — fetch them
    // together rather than one after the other.
    const [{ data: member }, { data: membershipsRaw }] = await Promise.all([
        service
            .from('organization_members')
            .select('role')
            .eq('organization_id', org.id)
            .eq('user_id', user.id)
            .maybeSingle(),
        service
            .from('organization_members')
            .select('organization_id, role, organizations!inner(id, slug, name)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true }),
    ])

    if (!member || !['owner', 'admin', 'staff'].includes(member.role)) {
        redirect('/')
    }

    const memberships = (membershipsRaw ?? []) as unknown as OrgMembership[]

    return { supabase, service, user, org, member, memberships }
})
