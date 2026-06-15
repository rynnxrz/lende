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
    const { service, user, org, member, memberships } = await withServerTiming(
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
