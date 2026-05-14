'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    Package,
    Calendar,
    Users,
    Settings,
    LogOut,
    Menu, // Import Menu icon
    FileText // Invoice icon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle
} from "@/components/ui/sheet"
import { OrgSwitcher, type OrgSwitcherMembership } from './OrgSwitcher'

const navItems: { href: string; label: string; icon: typeof LayoutDashboard; tour?: string }[] = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/items', label: 'Items', icon: Package, tour: 'listings' },
    { href: '/admin/reservations', label: 'Reservations', icon: Calendar, tour: 'reservations' },
    { href: '/admin/invoices', label: 'Invoices', icon: FileText, tour: 'lookbook' },
    { href: '/admin/customers', label: 'Customers', icon: Users, tour: 'team' },
]


/*
  SIDEBAR LOGIC:
  - Mobile (< md): Hidden by default. Toggle button fixed top-right. Opens Sheet.
  - Desktop (>= md): Fixed left, full height.
    - Default width: w-16 (collapsed).
    - Hover: w-64 (expanded).
    - Content in layout must have md:pl-16.
  - Top section: OrgSwitcher (BRIEF-63) when org context is supplied;
    legacy "Ivy's Rental" brand header otherwise. The legacy
    `src/app/admin/layout.tsx` route (out of scope per BRIEF-63 file
    boundaries) still renders <Sidebar /> without props, so all three
    org props remain optional.
*/

export interface SidebarProps {
    currentOrg?: { id: string; slug: string; name: string }
    currentRole?: string
    memberships?: OrgSwitcherMembership[]
}

export const Sidebar = ({
    currentOrg,
    currentRole,
    memberships,
}: SidebarProps) => {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const [isHovered, setIsHovered] = useState(false)
    const [isMobileOpen, setIsMobileOpen] = useState(false)

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    const closeMobileMenu = () => setIsMobileOpen(false)

    // BRIEF-63 — render the OrgSwitcher only when the caller supplied
    // org context (the new `/[slug]/admin/layout.tsx` does). The legacy
    // `/admin/layout.tsx` mounts <Sidebar /> bare and keeps the old
    // brand header so IVYJSTUDIO's production deployment is untouched.
    const hasOrgContext =
        !!currentOrg &&
        typeof currentRole === 'string' &&
        Array.isArray(memberships)

    const renderTopSlot = (expanded: boolean) => {
        if (hasOrgContext) {
            return (
                <OrgSwitcher
                    currentOrg={currentOrg!}
                    currentRole={currentRole!}
                    memberships={memberships!}
                    expanded={expanded}
                />
            )
        }
        return (
            <div
                className={cn(
                    'flex h-12 items-center px-4',
                    !expanded && 'justify-center px-0',
                )}
            >
                <span
                    className={cn(
                        'text-lg font-semibold text-slate-900 whitespace-nowrap transition-opacity',
                        expanded ? 'opacity-100 delay-200' : 'opacity-0',
                    )}
                >
                    Ivy&apos;s Rental
                </span>
            </div>
        )
    }

    // Navigation Item Renderer (Reused)
    const renderNavItems = (expanded: boolean, onClick?: () => void) => (
        <nav className="flex-1 space-y-1 px-2 py-4">
            {navItems.map((item) => {
                const isActive = pathname === item.href ||
                    (item.href !== '/admin' && pathname.startsWith(item.href))

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClick}
                        title={!expanded ? item.label : undefined}
                        data-tour={item.tour}
                        className={cn(
                            'flex items-center rounded-lg py-2 text-sm font-medium transition-colors whitespace-nowrap',
                            !expanded ? 'justify-center px-2' : 'gap-3 px-3',
                            isActive
                                ? 'bg-slate-200 text-slate-900 shadow-sm'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        )}
                    >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        {expanded && (
                            <span className="transition-opacity duration-200 animate-in fade-in slide-in-from-left-2">
                                {item.label}
                            </span>
                        )}
                    </Link>
                )
            })}
        </nav>
    )

    return (
        <>
            {/* --- MOBILE SIDEBAR (Sheet) --- */}
            <div className="md:hidden">
                <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                    <SheetTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className="fixed top-4 right-4 z-50 bg-white shadow-md border-slate-200"
                        >
                            <Menu className="h-5 w-5 text-slate-700" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-64 p-0 bg-slate-50 border-r-slate-200">
                        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                        <div className="flex h-full flex-col">
                            <div className="border-b border-slate-200 bg-white py-3">
                                {renderTopSlot(true)}
                            </div>

                            {renderNavItems(true, closeMobileMenu)}

                            <div className="p-4 border-t border-slate-200 bg-white space-y-1">
                                <Link
                                    href="/admin/settings"
                                    onClick={closeMobileMenu}
                                    className="flex w-full items-center rounded-lg py-2 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 mb-1 gap-3"
                                >
                                    <Settings className="h-5 w-5" />
                                    <span>Settings</span>
                                </Link>

                                <Button
                                    onClick={handleSignOut}
                                    variant="ghost"
                                    className="w-full justify-start gap-3 text-slate-600 hover:text-red-600 hover:bg-red-50 px-3"
                                >
                                    <LogOut className="h-5 w-5" />
                                    <span>Sign Out</span>
                                </Button>
                            </div>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>

            {/* --- DESKTOP SIDEBAR (Drawer Animation) --- */}
            <aside
                className={cn(
                    'hidden md:flex fixed left-0 top-0 h-screen flex-col border-r border-slate-100 bg-slate-50/95 backdrop-blur-sm z-40 overflow-hidden',
                    'transition-[width] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    isHovered ? 'w-60' : 'w-16'
                )}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Top slot — OrgSwitcher when org context supplied, legacy brand header otherwise */}
                <div className="py-3" style={{ width: '240px' }}>
                    {renderTopSlot(isHovered)}
                </div>

                <Separator className="bg-slate-200/50" />

                {/* Nav */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <nav className="flex-1 space-y-1 py-4" style={{ width: '240px' }}>
                        {navItems.map((item) => {
                            const isActive = pathname === item.href ||
                                (item.href !== '/admin' && pathname.startsWith(item.href))

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    title={!isHovered ? item.label : undefined}
                                    data-tour={item.tour}
                                    className={cn(
                                        'flex items-center mx-2 rounded-lg py-2 text-sm font-medium transition-colors',
                                        isActive
                                            ? 'bg-slate-200 text-slate-900'
                                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                    )}
                                >
                                    <div className="flex items-center justify-center w-12 flex-shrink-0">
                                        <item.icon className="h-5 w-5" />
                                    </div>
                                    <span
                                        className={cn(
                                            "whitespace-nowrap transition-opacity",
                                            isHovered ? "opacity-100 delay-200" : "opacity-0"
                                        )}
                                    >
                                        {item.label}
                                    </span>
                                </Link>
                            )
                        })}
                    </nav>
                </div>

                <Separator className="bg-slate-200/50" />

                {/* Footer Controls */}
                <div className="py-2" style={{ width: '240px' }}>
                    <Link
                        href="/admin/settings"
                        title={!isHovered ? 'Settings' : undefined}
                        data-tour="settings"
                        className={cn(
                            'flex items-center mx-2 rounded-lg py-2 text-sm font-medium transition-colors',
                            pathname === '/admin/settings'
                                ? 'bg-slate-200 text-slate-900'
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                        )}
                    >
                        <div className="flex items-center justify-center w-12 flex-shrink-0">
                            <Settings className="h-5 w-5" />
                        </div>
                        <span
                            className={cn(
                                "whitespace-nowrap transition-opacity",
                                isHovered ? "opacity-100 delay-200" : "opacity-0"
                            )}
                        >
                            Settings
                        </span>
                    </Link>

                    <button
                        title={!isHovered ? 'Sign Out' : undefined}
                        className="flex items-center mx-2 rounded-lg py-2 text-sm font-medium text-slate-500 transition-colors hover:text-red-600 hover:bg-red-50 w-[calc(100%-16px)]"
                        onClick={handleSignOut}
                    >
                        <div className="flex items-center justify-center w-12 flex-shrink-0">
                            <LogOut className="h-5 w-5" />
                        </div>
                        <span
                            className={cn(
                                "whitespace-nowrap transition-opacity",
                                isHovered ? "opacity-100 delay-200" : "opacity-0"
                            )}
                        >
                            Sign Out
                        </span>
                    </button>
                </div>
            </aside>
        </>
    )
}
