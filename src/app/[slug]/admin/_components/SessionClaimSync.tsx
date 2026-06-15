"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

/**
 * Self-heal for a stale/missing `app_metadata.current_org_id` JWT claim.
 *
 * The admin layout resolves the org by URL slug + membership and stamps the
 * correct `current_org_id` server-side when the claim is wrong. Org-scoped RLS
 * still reads the claim from the *token*, so we refresh the client session here
 * to pull the freshly-stamped value, then re-render the server tree. Mounted
 * only when the layout detected a mismatch, so on the next render the claim
 * matches and this component is gone — no loop.
 */
export function SessionClaimSync() {
    const router = useRouter()
    const ran = useRef(false)

    useEffect(() => {
        if (ran.current) return
        ran.current = true
        const supabase = createClient()
        void supabase.auth.refreshSession().then(() => router.refresh())
    }, [router])

    return null
}
