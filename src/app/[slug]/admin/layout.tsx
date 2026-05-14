import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/admin/Sidebar'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner'

export default async function OrgAdminLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const normalizedSlug = decodeURIComponent(slug).toLowerCase()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Verify slug matches the user's current org from JWT
    const currentOrgId = user.app_metadata?.current_org_id
    if (!currentOrgId) {
        redirect('/login')
    }

    const service = createServiceClient()
    const { data: org } = await service
        .from('organizations')
        .select('id, slug, name')
        .eq('id', currentOrgId)
        .single()

    if (!org) {
        redirect('/login')
    }

    // Slug mismatch → redirect to user's actual org
    if (normalizedSlug !== org.slug.toLowerCase()) {
        redirect(`/${org.slug}/admin`)
    }

    // Verify membership
    const { data: member } = await service
        .from('organization_members')
        .select('role')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .maybeSingle()

    if (!member || !['owner', 'admin', 'staff'].includes(member.role)) {
        redirect('/')
    }

    // BRIEF-63 — fetch all of the user's memberships so the Sidebar
    // OrgSwitcher can list every workspace they belong to. We use the
    // service role here because RLS on `organization_members` only
    // returns rows whose org matches the JWT's `current_org_id`; the
    // dropdown explicitly wants rows for OTHER orgs the user can
    // switch into.
    const { data: membershipsRaw } = await service
        .from('organization_members')
        .select('organization_id, role, organizations!inner(id, slug, name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

    type RawMembership = {
        organization_id: string
        role: string
        organizations: { id: string; slug: string; name: string } | null
    }
    const memberships: RawMembership[] = (membershipsRaw ?? []) as unknown as RawMembership[]

    const isEmailVerified = user.email_confirmed_at != null

    return (
        <div className="min-h-screen bg-slate-100">
            {!isEmailVerified && user.email && (
                <EmailVerificationBanner email={user.email} />
            )}

            <Sidebar
                currentOrg={{ id: org.id, slug: org.slug, name: org.name }}
                currentRole={member.role}
                memberships={memberships}
            />

            <main className="min-h-screen w-full md:pl-16 transition-[padding] duration-300">
                <div className="p-4 md:p-8 pt-16 md:pt-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
