"use client"

import { RequestFloatingButton } from "@/components/RequestFloatingButton"
import { BRAND_NAME_UPPER } from "@/lib/constants/brand"
import Link from "next/link"
import { usePathname } from "next/navigation"

/**
 * Tenant admin/catalog header (legacy single-tenant deployment).
 *
 * Only renders on known tenant routes (admin, catalog, etc.) so the
 * (marketing) layout's MarketingHeader handles everything else — including
 * 404 pages via root not-found.tsx.
 */
const TENANT_PREFIXES = [
    "/admin", "/catalog", "/archive", "/wholesale",
    "/request", "/payment", "/payment-confirmation", "/legacy",
    "/system-admin",
]
const ORG_TENANT_RE = /^\/[^/]+\/(admin|catalog|archive|wholesale|request|payment|payment-confirmation)\b/

export function Header() {
    const pathname = usePathname() ?? ""

    const isTenantRoute =
        TENANT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
        ORG_TENANT_RE.test(pathname)

    if (!isTenantRoute) return null

    return (
        <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
            <div className="flex h-16 items-center justify-between px-4 sm:px-8 max-w-[1920px] mx-auto">
                {/* Project Name / Logo */}
                <Link href="/" className="text-xl font-medium tracking-[0.2em] text-gray-900 hover:opacity-70 transition-opacity focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-sm">
                    {BRAND_NAME_UPPER}
                </Link>

                {/* Cart Action */}
                <RequestFloatingButton />
            </div>
        </header>
    )
}
