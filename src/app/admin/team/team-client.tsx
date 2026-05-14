'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Trash2, Clock, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createInvitationAction, revokeInvitationAction } from '@/app/actions/invitations/create'

interface Member {
    userId: string
    email: string
    role: string
    joinedAt: string | null
}

interface Invitation {
    id: string
    email: string
    role: string
    createdAt: string
    expiresAt: string
    expired: boolean
}

export function TeamClient({
    organizationId,
    members,
    invitations,
}: {
    organizationId: string
    members: Member[]
    invitations: Invitation[]
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState<'admin' | 'staff'>('staff')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const handleInvite = (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        startTransition(async () => {
            const result = await createInvitationAction({
                organizationId,
                email: inviteEmail,
                role: inviteRole,
            })

            if (!result.ok) {
                setError(result.error)
                return
            }

            setSuccess(
                result.emailSent
                    ? `Invitation sent to ${inviteEmail}`
                    : `Invitation created for ${inviteEmail} (email delivery failed, share the link manually)`
            )
            setInviteEmail('')
            router.refresh()
        })
    }

    const handleRevoke = (invitationId: string) => {
        startTransition(async () => {
            const result = await revokeInvitationAction(invitationId)
            if (!result.ok) {
                setError(result.error)
                return
            }
            router.refresh()
        })
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6 p-6">
            <h1 className="text-2xl font-semibold">Team</h1>

            {/* Invite form */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        Invite a team member
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleInvite} className="flex gap-3 items-end">
                        <div className="flex-1 space-y-1">
                            <Label htmlFor="invite-email">Email</Label>
                            <Input
                                id="invite-email"
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="team@example.com"
                                disabled={isPending}
                            />
                        </div>
                        <div className="w-28 space-y-1">
                            <Label>Role</Label>
                            <Select
                                value={inviteRole}
                                onValueChange={(v) => setInviteRole(v as 'admin' | 'staff')}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="staff">Staff</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button type="submit" disabled={!inviteEmail || isPending}>
                            {isPending ? 'Sending...' : 'Invite'}
                        </Button>
                    </form>

                    {error && (
                        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-600">
                            {success}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Current members */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Members ({members.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {members.map((m) => (
                        <div
                            key={m.userId}
                            className="flex items-center justify-between rounded-md border p-3"
                        >
                            <div className="flex items-center gap-3">
                                <Check className="h-4 w-4 text-green-500" />
                                <div>
                                    <p className="text-sm font-medium">{m.email}</p>
                                    {m.joinedAt && (
                                        <p className="text-xs text-muted-foreground">
                                            Joined {new Date(m.joinedAt).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <Badge variant="secondary">{m.role}</Badge>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Pending invitations */}
            {invitations.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">
                            Pending Invitations ({invitations.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {invitations.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex items-center justify-between rounded-md border p-3"
                            >
                                <div className="flex items-center gap-3">
                                    <Clock className="h-4 w-4 text-amber-500" />
                                    <div>
                                        <p className="text-sm font-medium">{inv.email}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {inv.expired
                                                ? 'Expired'
                                                : `Expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant={inv.expired ? 'destructive' : 'secondary'}>
                                        {inv.role}
                                    </Badge>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRevoke(inv.id)}
                                        disabled={isPending}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
