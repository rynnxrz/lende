import { Sidebar } from '@/components/admin/Sidebar'
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner'
import { SessionClaimSync } from './_components/SessionClaimSync'
import { getOrgAdminContext } from '@/lib/admin/org-context'
import { withServerTiming } from '@/lib/admin/perf'

export default async function OrgAdminLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const { service, user, org, member } = await withServerTiming(
        'admin-layout:org-context',
        () => getOrgAdminContext(slug),
    )

    // Org-scoped RLS reads `app_metadata.current_org_id` from the token. If it
    // is missing or points at a different org, stamp the correct value and let
    // <SessionClaimSync> refresh the client token so RLS lines up — instead of
    // bouncing the user out.
    const claimNeedsSync = user.app_metadata?.current_org_id !== org.id
    if (claimNeedsSync) {
        await service.auth.admin
            .updateUserById(user.id, {
                app_metadata: {
                    ...(user.app_metadata ?? {}),
                    current_org_id: org.id,
                    current_org_role: member.role,
                },
            })
            .catch(() => {})
    }

    // BRIEF-63 — fetch all of the user's memberships so the Sidebar
    // OrgSwitcher can list every workspace they belong to. We use the
    // service role here because RLS on `organization_members` only
    // returns rows whose org matches the JWT's `current_org_id`; the
    // dropdown explicitly wants rows for OTHER orgs the user can
    // switch into.
    const { data: membershipsRaw } = await withServerTiming('admin-layout:memberships', async () => await service
        .from('organization_members')
        .select('organization_id, role, organizations!inner(id, slug, name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }))

    type RawMembership = {
        organization_id: string
        role: string
        organizations: { id: string; slug: string; name: string } | null
    }
    const memberships: RawMembership[] = (membershipsRaw ?? []) as unknown as RawMembership[]

    const isEmailVerified = user.email_confirmed_at != null

    return (
        <div className="min-h-screen bg-muted">
            {claimNeedsSync && <SessionClaimSync />}
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
