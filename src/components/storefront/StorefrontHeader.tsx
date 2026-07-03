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
        <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#030817] text-[#f7f5f0] shadow-[0_1px_0_rgba(255,255,255,0.04)]">
            <div className="mx-auto flex h-16 items-center justify-between px-4 sm:px-8 max-w-[1920px]">
                <Link
                    href={`/${orgSlug}`}
                    className="text-xl font-medium tracking-[0.28em] text-[#f7f5f0] transition-opacity duration-300 hover:opacity-75 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030817] focus-visible:outline-none rounded-sm uppercase"
                >
                    {orgName}
                </Link>

                {!isHome && (
                    <div className="flex items-center gap-6">
                        <nav className="hidden md:flex items-center gap-9 text-sm text-[#f7f5f0]/58">
                            <Link
                                href={`/${orgSlug}/catalog`}
                                className="transition-colors duration-300 hover:text-[#f7f5f0] focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030817] focus-visible:outline-none rounded-sm"
                            >
                                Catalog
                            </Link>
                            <Link
                                href={`/${orgSlug}/wholesale`}
                                className="transition-colors duration-300 hover:text-[#f7f5f0] focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030817] focus-visible:outline-none rounded-sm"
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
