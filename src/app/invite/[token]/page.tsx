import {
    existingUserExists,
    getInvitationByToken,
} from '@/app/actions/invitations/accept'
import { InviteAcceptForm } from './invite-accept-form'
import { track } from '@/lib/analytics/track'

/**
 * BRIEF-59 — invite landing.
 *
 * After validating the invitation we explicitly probe whether an
 * auth.users row already exists for this email by calling
 * existingUserExists (admin.listUsers under the hood) and pass the
 * resulting mode ('new' | 'existing') to the form. This decides
 * whether the user sees a "Set a password" or "Welcome back. Sign in
 * to join {orgName}" experience.
 *
 * The probe runs server-side only (service-role) and the page
 * doesn't expose the result over the wire — the form variant is
 * the only client-visible signal.
 */
export default async function InvitePage({
    params,
}: {
    params: Promise<{ token: string }>
}) {
    const { token } = await params
    const invitation = await getInvitationByToken(token)

    if (!invitation) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
                <div className="w-full max-w-md text-center space-y-4">
                    <h1 className="text-2xl font-semibold">Invalid Invitation</h1>
                    <p className="text-muted-foreground">
                        This invitation link is invalid or has already been used.
                    </p>
                </div>
            </div>
        )
    }

    if (invitation.accepted) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
                <div className="w-full max-w-md text-center space-y-4">
                    <h1 className="text-2xl font-semibold">Invitation Already Accepted</h1>
                    <p className="text-muted-foreground">
                        This invitation has already been used. You can log in to access your account.
                    </p>
                    <a
                        href="/login"
                        className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                        Go to Login
                    </a>
                </div>
            </div>
        )
    }

    if (invitation.expired) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
                <div className="w-full max-w-md text-center space-y-4">
                    <h1 className="text-2xl font-semibold">Invitation Expired</h1>
                    <p className="text-muted-foreground">
                        This invitation has expired. Please ask your administrator for a new one.
                    </p>
                </div>
            </div>
        )
    }

    // BRIEF-59 — probe for an existing auth.users row (uses
    // service-role admin.listUsers under the hood). Decides which
    // form variant the user sees.
    const userProbe = await existingUserExists(invitation.email)
    const mode = userProbe.exists ? 'existing' : 'new'

    track('invitation_link_clicked', { token, mode })

    return (
        <InviteAcceptForm
            token={token}
            email={invitation.email}
            orgName={invitation.orgName}
            role={invitation.role}
            mode={mode}
        />
    )
}
