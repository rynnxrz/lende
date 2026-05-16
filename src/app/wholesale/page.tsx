"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from "sonner"
import { CustomerServiceWidget } from '@/components/customer-service/CustomerServiceWidget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Lock, ArrowRight, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react'
import { verifyWholesalePassword, checkWholesaleAuth } from '@/actions/wholesale'
import { cn } from '@/lib/utils'

// PR-A: legacy /wholesale path is rewritten from /ivyjstudio/wholesale via
// middleware Phase A. After PR-B physical move, this page lives at
// /[slug]/wholesale and reads params.slug. For now, hard-code IVYJSTUDIO —
// it's the only org accepted by Phase A middleware anyway.
const ORG_SLUG = 'ivyjstudio'

export default function WholesalePage() {
    const router = useRouter()
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isCheckingAuth, setIsCheckingAuth] = useState(true)
    const [isSuccess, setIsSuccess] = useState(false)

    useEffect(() => {
        // Check if already authenticated
        const checkAuth = async () => {
            const isAuthenticated = await checkWholesaleAuth(ORG_SLUG)
            if (isAuthenticated) {
                router.replace(`/${ORG_SLUG}/catalog?mode=wholesale`)
            } else {
                setIsCheckingAuth(false)
            }
        }
        checkAuth()
    }, [router])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!password) return

        setIsLoading(true)

        try {
            const result = await verifyWholesalePassword(password, ORG_SLUG)
            if (result.success) {
                setIsSuccess(true)
                toast.success("Access Granted", {
                    description: "Welcome to the Wholesale Portal",
                    icon: <ShieldCheck className="w-5 h-5 text-emerald-500" />,
                })
                // Small delay to show success state before redirect
                setTimeout(() => {
                    router.replace(`/${ORG_SLUG}/catalog?mode=wholesale`)
                }, 800)
            } else {
                toast.error("Access Denied", {
                    description: result.error || "Incorrect password",
                })
                setPassword('')
                setIsLoading(false)
            }
        } catch (error) {
            console.error('Auth error:', error)
            toast.error("System Error", {
                description: "Please try again later."
            })
            setIsLoading(false)
        }
    }

    if (isCheckingAuth) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 animate-pulse">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <Lock className="h-5 w-5 text-slate-300" />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-white to-slate-100">
            {/* Background decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-slate-50/50 blur-3xl opacity-60" />
                <div className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] rounded-full bg-slate-100/50 blur-3xl opacity-60" />
            </div>

            <div className={cn(
                "w-full max-w-md relative z-10 transition-all duration-700 ease-out",
                "animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-700"
            )}>
                <Card className={cn(
                    "border-slate-100/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white/80 backdrop-blur-xl overflow-hidden transition-all duration-500",
                    isSuccess && "ring-2 ring-emerald-500/20 scale-[1.02] shadow-[0_20px_50px_rgb(16,185,129,0.1)]"
                )}>
                    {/* Progress Line */}
                    {isLoading && !isSuccess && (
                        <div className="absolute top-0 left-0 w-full h-1 bg-slate-100 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-slate-200 via-slate-400 to-slate-200 animate-progress w-[50%]" />
                        </div>
                    )}

                    <CardHeader className="text-center pb-8 pt-10">
                        <div className={cn(
                            "mx-auto mb-6 w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm",
                            isSuccess
                                ? "bg-emerald-50 text-emerald-600 scale-110 rotate-3"
                                : "bg-slate-50 text-slate-800 rotate-0"
                        )}>
                            {isSuccess ? (
                                <ShieldCheck className="h-8 w-8 animate-in zoom-in delay-100" />
                            ) : (
                                <Lock className="h-7 w-7 opacity-80" />
                            )}
                        </div>
                        <CardTitle className="text-2xl font-light tracking-wide text-slate-900">
                            Wholesale Access
                        </CardTitle>
                        <CardDescription className="text-slate-500 mt-2 text-base font-light">
                            Secured portal for authorized partners
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="pb-10 px-8">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2 group">
                                <div className="relative">
                                    <Input
                                        type="password"
                                        placeholder="Enter Access Key"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={cn(
                                            "h-14 text-center text-lg tracking-[0.2em] transition-all duration-300",
                                            "border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white",
                                            "focus:ring-2 focus:ring-slate-200 focus:border-slate-300",
                                            "placeholder:text-slate-300 placeholder:tracking-normal placeholder:text-base",
                                            isSuccess && "border-emerald-200 text-emerald-700 bg-emerald-50/30"
                                        )}
                                        autoFocus
                                        disabled={isLoading || isSuccess}
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className={cn(
                                    "w-full h-12 text-base font-medium transition-all duration-500",
                                    "bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/10",
                                    isSuccess && "bg-emerald-600 hover:bg-emerald-600 shadow-emerald-500/20"
                                )}
                                disabled={isLoading || isSuccess}
                            >
                                {isLoading ? (
                                    <Loader2 className="h-5 w-5 animate-spin opacity-50" />
                                ) : isSuccess ? (
                                    <span className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                                        Access Granted <ArrowRight className="h-4 w-4" />
                                    </span>
                                ) : (
                                    "Enter Portal"
                                )}
                            </Button>
                        </form>

                        <div className="mt-8 text-center">
                            <Link
                                href="/"
                                className="inline-flex items-center text-sm text-slate-400 hover:text-slate-600 transition-colors gap-1 group py-2 px-4 rounded-full hover:bg-slate-50"
                            >
                                <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" />
                                Back to Homepage
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                <p className="mt-8 text-center text-xs text-slate-300 font-light tracking-wider uppercase opacity-0 animate-in fade-in delay-700 fill-mode-forwards">
                    Authenticated access only
                </p>
            </div>

            <style jsx global>{`
                @keyframes progress {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(200%); }
                }
                .animate-progress {
                    animation: progress 1.5s infinite linear;
                }
            `}</style>
            <CustomerServiceWidget
                storageKey="customer-service:wholesale"
                baseContext={{
                    pageType: 'wholesale_gate',
                    path: `/${ORG_SLUG}/wholesale`,
                    orgSlug: ORG_SLUG,
                    wholesale: {
                        authenticated: isSuccess,
                    },
                }}
            />
        </div>
    )
}
