import Link from "next/link"
import { confirmAuthAction } from "@/app/actions/auth/confirm"
import type { ConfirmAuthType } from "@/app/actions/auth/confirm"

export const dynamic = "force-dynamic"

const COPY: Record<ConfirmAuthType, { heading: string; body: string; cta: string }> = {
    recovery: {
        heading: "Confirm password reset.",
        body: "Click below to continue resetting your password.",
        cta: "Continue",
    },
    signup: {
        heading: "Confirm your email.",
        body: "Click below to finish creating your account.",
        cta: "Confirm and continue",
    },
    email_change: {
        heading: "Confirm new email address.",
        body: "Click below to confirm this is your new email.",
        cta: "Confirm email",
    },
}

const VALID_TYPES = new Set<ConfirmAuthType>(["recovery", "signup", "email_change"])

interface ConfirmPageProps {
    searchParams: Promise<{
        token_hash?: string
        type?: string
        next?: string
    }>
}

/**
 * Click-to-confirm interstitial — see confirmAuthAction for why this page
 * exists. This is a plain GET render (no Supabase calls), so it's safe for
 * email scanners to prefetch. The token is only consumed when the user
 * submits the form below.
 */
export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
    const params = await searchParams
    const tokenHash = params.token_hash ?? ""
    const type = params.type ?? ""
    const next = params.next ?? "/"

    const isValid = !!tokenHash && VALID_TYPES.has(type as ConfirmAuthType)

    if (!isValid) {
        return (
            <main>
                <section>
                    <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
                        <div className="max-w-sm mx-auto text-center space-y-4">
                            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-4">
                                ● Confirm
                            </p>
                            <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground mb-2">
                                This link is invalid.
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                It may have already been used, or the link is incomplete.
                                Request a new one to continue.
                            </p>
                            <div className="pt-4">
                                <Link
                                    href="/forgot-password"
                                    className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                                >
                                    Request a new link
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        )
    }

    const copy = COPY[type as ConfirmAuthType]

    return (
        <main>
            <section>
                <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
                    <div className="max-w-sm mx-auto text-center">
                        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8">
                            ● Confirm
                        </p>
                        <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground mb-2">
                            {copy.heading}
                        </h1>
                        <p className="text-sm text-muted-foreground mb-10">{copy.body}</p>

                        <form action={confirmAuthAction}>
                            <input type="hidden" name="token_hash" value={tokenHash} />
                            <input type="hidden" name="type" value={type} />
                            <input type="hidden" name="next" value={next} />
                            <button
                                type="submit"
                                className="w-full inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                            >
                                {copy.cta}
                            </button>
                        </form>
                    </div>
                </div>
            </section>
        </main>
    )
}
