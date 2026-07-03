"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { RequestFloatingButton } from "@/components/RequestFloatingButton"

interface StorefrontHeaderProps {
    orgSlug: string
    orgName: string
}

export function StorefrontHeader({ orgSlug, orgName }: StorefrontHeaderProps) {
    const pathname = usePathname()
    const normalizedPath = pathname.replace(/\/+$/, "") || "/"
    const homePath = `/${orgSlug}`
    const isHome = normalizedPath === homePath

    return (
        <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/95 text-slate-900 backdrop-blur-md">
            <div className="mx-auto flex h-16 items-center justify-between px-4 sm:px-8 max-w-[1920px]">
                <Link
                    href={`/${orgSlug}`}
                    className="text-xl font-medium tracking-[0.28em] text-slate-900 transition-opacity duration-300 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none rounded-sm uppercase"
                >
                    {orgName}
                </Link>

                {!isHome && (
                    <div className="flex items-center gap-6">
                        <nav className="hidden md:flex items-center gap-9 text-sm text-slate-500">
                            <Link
                                href={`/${orgSlug}/catalog`}
                                className="transition-colors duration-300 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none rounded-sm"
                            >
                                Catalog
                            </Link>
                            <Link
                                href={`/${orgSlug}/wholesale`}
                                className="transition-colors duration-300 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none rounded-sm"
                            >
                                Wholesale
                            </Link>
                        </nav>

                        <RequestFloatingButton />
                    </div>
                )}
            </div>
        </header>
    )
}
