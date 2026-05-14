'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Gem } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
    acceptInvitationAction,
    type AcceptInvitationMode,
} from '@/app/actions/invitations/accept'

/**
 * BRIEF-59 — dual-mode invite-accept form.
 *
 * mode='new'      → "Set your password" (single password input)
 * mode='existing' → "Welcome back. Sign in to join {orgName}" (single
 *                   existing-password input; we re-authenticate the user
 *                   before linking the new org membership)
 *
 * The email field is always disabled and shows the invitation address.
 */
export function InviteAcceptForm({
    token,
    email,
    orgName,
    role,
    mode,
}: {
    token: string
    email: string
    orgName: string
    role: string
    mode: AcceptInvitationMode
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)

    const isExisting = mode === 'existing'
    const canSubmit = password.length >= 8 && !isPending

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        startTransition(async () => {
            try {
                const result = await acceptInvitationAction(
                    isExisting
                        ? { token, mode: 'existing', existingPassword: password }
                        : { token, mode: 'new', password },
                )
                if (!result.ok) {
                    setError(result.error)
                    return
                }
                router.push(`/${result.slug}/admin`)
                router.refresh()
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : 'Unexpected error. Please try again.',
                )
            }
        })
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900">
                        <Gem className="h-6 w-6 text-white" />
                    </div>
                    <CardTitle className="text-2xl">
                        {isExisting ? `Welcome back.` : `Join ${orgName}`}
                    </CardTitle>
                    <CardDescription>
                        {isExisting
                            ? `Sign in to join ${orgName} as ${role}.`
                            : `You've been invited to join as ${role}. Set a password to create your account.`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                disabled
                                className="bg-slate-50"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">
                                {isExisting ? 'Your current password' : 'Password'}
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete={isExisting ? 'current-password' : 'new-password'}
                                required
                                minLength={8}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={
                                    isExisting ? 'The password you already use' : 'At least 8 characters'
                                }
                                disabled={isPending}
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div
                                role="alert"
                                className="rounded-md bg-red-50 p-3 text-sm text-red-600"
                            >
                                {error}
                            </div>
                        )}

                        <Button type="submit" className="w-full" disabled={!canSubmit}>
                            {isPending
                                ? isExisting
                                    ? 'Joining...'
                                    : 'Creating account...'
                                : isExisting
                                  ? `Sign in & join ${orgName}`
                                  : 'Accept invitation'}
                        </Button>

                        {isExisting && (
                            <p className="text-xs text-muted-foreground text-center">
                                Forgot your password?{' '}
                                <Link
                                    href="/forgot-password"
                                    className="text-foreground hover:underline underline-offset-4 font-medium"
                                >
                                    Reset it
                                </Link>{' '}
                                — your invitation will still be valid afterwards.
                            </p>
                        )}

                        {!isExisting && (
                            <p className="text-xs text-muted-foreground text-center">
                                By accepting you agree to our terms.
                            </p>
                        )}
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
