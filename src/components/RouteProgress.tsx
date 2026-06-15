'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import NProgress from 'nprogress'

const READY_TIMEOUT_MS = 5000

// nextjs-toploader's pushState/replaceState wrapper calls NProgress.done()
// synchronously at navigation start (before the new route's skeleton even
// commits). done() sets status back to null and schedules a delayed
// NProgress.remove() ~2x the configured speed later. If we then re-arm the
// bar with start(), that stale removal fires afterwards and tears down the
// element start() just (re)rendered, making the bar vanish entirely.
// Suppress removals while a newer progress session is active (status is a
// number); our own done() sets status back to null before scheduling its
// removal, so legitimate removals still go through.
const originalRemove = NProgress.remove.bind(NProgress)
NProgress.remove = () => {
    if (NProgress.isStarted()) return
    originalRemove()
}

let onRouteReady: (() => void) | null = null

// Called by <TopLoaderReady /> once a navigated-to page's real content
// (not its loading.tsx skeleton) has mounted.
export function signalRouteReady() {
    onRouteReady?.()
}

// nextjs-toploader calls done() the instant pushState/replaceState fires —
// i.e. when the new route's loading.tsx skeleton starts rendering, not when
// its real content is ready. Re-arm the bar on every route change and only
// finish it once <TopLoaderReady /> confirms real content has mounted.
export function RouteProgress() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const routeKey = `${pathname}?${searchParams.toString()}`
    const prevKeyRef = useRef(routeKey)

    useEffect(() => {
        if (prevKeyRef.current === routeKey) return
        prevKeyRef.current = routeKey

        NProgress.start()

        const timeout = setTimeout(() => {
            onRouteReady = null
            NProgress.done()
        }, READY_TIMEOUT_MS)

        onRouteReady = () => {
            clearTimeout(timeout)
            onRouteReady = null
            NProgress.done()
        }

        return () => {
            clearTimeout(timeout)
        }
    }, [routeKey])

    return null
}
