"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { Moon, Sun } from "lucide-react"

/**
 * Sticky marketing header.
 * - lende logo (D1 locked 2026-05-02; BRIEF-07 字串扫除完成)
 * - Nav: Features / Pricing / Demo / Login
 * - Primary CTA: "Start free trial" (D6 locked)
 * - Half-transparent + backdrop-blur (per stage-1 prompt)
 * - Dark mode toggle
 *
 * NO tenant-specific branding here. This component is independent from
 * src/components/Header.tsx (which is the legacy tenant admin/catalog header).
 */
export function MarketingHeader() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    if (typeof document === "undefined") return
    const stored = localStorage.getItem("theme")
    if (stored === "dark" || stored === "light") {
      const dark = stored === "dark"
      document.documentElement.classList.toggle("dark", dark)
      document.documentElement.classList.toggle("light", !dark)
      setIsDark(dark)
    } else {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      document.documentElement.classList.toggle("dark", systemDark)
      setIsDark(systemDark)
    }
  }, [])

  const toggleDark = () => {
    if (typeof document === "undefined") return
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle("dark", next)
    document.documentElement.classList.toggle("light", !next)
    localStorage.setItem("theme", next ? "dark" : "light")
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 sm:px-8 max-w-[1920px] mx-auto">
        {/* Logo (placeholder) */}
        <Link
          href="/"
          className="text-base font-medium tracking-[0.2em] text-foreground hover:opacity-70 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded-sm"
        >
          lende
        </Link>

        {/* Right cluster */}
        <div className="flex items-center gap-2 sm:gap-6">
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/features" className="hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/demo" className="hover:text-foreground transition-colors">
              Demo
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Login
            </Link>
          </nav>

          <button
            type="button"
            onClick={toggleDark}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <Link
            href="/signup"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Request access
          </Link>
        </div>
      </div>
    </header>
  )
}
