import { cache } from 'react'
import { redirect } from 'next/navigation'

import { createClient, createServiceClient } from '@/lib/supabase/server'

export const getOrgAdminContext = cache(async (slug: string) => {
    const normalizedSlug = decodeURIComponent(slug).toLowerCase()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const service = createServiceClient()
    const { data: org } = await service
        .from('organizations')
        .select('id, slug, name')
        .eq('slug', normalizedSlug)
        .maybeSingle()

    if (!org) redirect('/')

    const { data: member } = await service
        .from('organization_members')
        .select('role')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .maybeSingle()

    if (!member || !['owner', 'admin', 'staff'].includes(member.role)) {
        redirect('/')
    }

    return { supabase, service, user, org, member }
})
