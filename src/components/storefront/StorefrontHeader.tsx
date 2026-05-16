"use client"

import Link from "next/link"
import { RequestFloatingButton } from "@/components/RequestFloatingButton"

interface StorefrontHeaderProps {
    orgSlug: string
    orgName: string
}

export function StorefrontHeader({ orgSlug, orgName }: StorefrontHeaderProps) {
    return (
        <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
            <div className="flex h-16 items-center justify-between px-4 sm:px-8 max-w-[1920px] mx-auto">
                <Link
                    href={`/${orgSlug}`}
                    className="text-xl font-medium tracking-[0.2em] text-gray-900 hover:opacity-70 transition-opacity focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-sm uppercase"
                >
                    {orgName}
                </Link>

                <nav className="hidden md:flex items-center gap-8 text-sm text-gray-700">
                    <Link
                        href={`/${orgSlug}/catalog`}
                        className="hover:text-gray-900 transition-colors focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-sm"
                    >
                        Catalog
                    </Link>
                    <Link
                        href={`/${orgSlug}/wholesale`}
                        className="hover:text-gray-900 transition-colors focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-sm"
                    >
                        Wholesale
                    </Link>
                </nav>

                <RequestFloatingButton />
            </div>
        </header>
    )
}
