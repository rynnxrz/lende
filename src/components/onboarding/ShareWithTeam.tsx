'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createInvitationAction } from '@/app/actions/invitations/create'
import { Users } from 'lucide-react'

interface ShareWithTeamProps {
    organizationId: string
    onDismiss?: () => void
}

export function ShareWithTeam({ organizationId, onDismiss }: ShareWithTeamProps) {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<'admin' | 'staff'>('staff')
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [isPending, startTransition] = useTransition()

    const handleSend = () => {
        if (!email.trim()) return

        startTransition(async () => {
            const result = await createInvitationAction({
                organizationId,
                email: email.trim(),
                role,
            })

            if (result.ok) {
                setMessage({ type: 'success', text: `Invitation sent to ${email}` })
                setEmail('')
            } else {
                setMessage({ type: 'error', text: result.error })
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-lg">Invite your team</CardTitle>
                    </div>
                    {onDismiss && (
                        <Button variant="ghost" size="sm" onClick={onDismiss}>
                            Skip for now
                        </Button>
                    )}
                </div>
                <CardDescription>
                    Add team members to collaborate on listings and reservations.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                        <label className="text-sm font-medium" htmlFor="invite-email">
                            Email
                        </label>
                        <Input
                            id="invite-email"
                            type="email"
                            placeholder="colleague@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        />
                    </div>
                    <div className="w-32">
                        <label className="text-sm font-medium" htmlFor="invite-role">
                            Role
                        </label>
                        <select
                            id="invite-role"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={role}
                            onChange={(e) => setRole(e.target.value as 'admin' | 'staff')}
                        >
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <Button onClick={handleSend} disabled={isPending || !email.trim()}>
                        {isPending ? 'Sending...' : 'Send invite'}
                    </Button>
                </div>

                {message && (
                    <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {message.text}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
