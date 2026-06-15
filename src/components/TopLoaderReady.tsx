'use client'

import { useEffect } from 'react'
import { signalRouteReady } from './RouteProgress'

// Renders nothing. Lives in each admin page's resolved JSX (not loading.tsx),
// so it only mounts once Suspense swaps the skeleton for real content —
// that's the signal RouteProgress needs to finish the top bar.
export function TopLoaderReady() {
    useEffect(() => {
        signalRouteReady()
    })

    return null
}
