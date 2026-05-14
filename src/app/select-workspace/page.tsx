"use client"

export const dynamic = "force-dynamic"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { setActiveOrgAndRedirectAction } from "@/app/select-workspace/select-workspace-action"

interface Membership {
  organization_id: string
  role: string
  organizations: {
    slug: string
    name: string
  }
}

export default function SelectWorkspacePage() {
  return (
    <Suspense>
      <SelectWorkspaceContent />
    </Suspense>
  )
}

function SelectWorkspaceContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const nextHint = searchParams?.get("next")?.trim() ?? null

  const [memberships, setMemberships] = useState<Membership[] | null>(null)
  const [lastActiveOrgId, setLastActiveOrgId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickingId, setPickingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace("/login")
        return
      }

      const [{ data: rows, error: memberError }, { data: profile }] = await Promise.all([
        supabase
          .from("organization_members")
          .select("organization_id, role, organizations!inner(slug, name)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("profiles")
          .select("last_active_org_id")
          .eq("id", user.id)
          .maybeSingle(),
      ])

      if (cancelled) return
      if (memberError) {
        setError(memberError.message)
        return
      }
      const list = (rows ?? []) as unknown as Membership[]

      // Single-org defensive bounce: in case the user landed here
      // directly with only 1 membership, send them straight in.
      if (list.length === 1) {
        const slug = list[0].organizations?.slug
        if (slug) {
          router.replace(`/${slug}/admin`)
          return
        }
      }
      if (list.length === 0) {
        router.replace("/admin")
        return
      }

      setMemberships(list)
      setLastActiveOrgId((profile as { last_active_org_id?: string } | null)?.last_active_org_id ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [router, supabase])

  const onPick = async (orgId: string, slug: string) => {
    setPickingId(orgId)
    setError(null)
    const res = await setActiveOrgAndRedirectAction(orgId)
    if (!res.ok) {
      setPickingId(null)
      setError(res.error ?? "Could not switch workspaces.")
      return
    }
    const target = isSafeNext(nextHint, res.slug ?? slug)
      ? (nextHint as string)
      : `/${res.slug ?? slug}/admin`
    router.refresh()
    router.push(target)
  }

  const onSignOut = async () => {
    await supabase.auth.signOut()
    router.refresh()
    router.push("/login")
  }

  return (
    <main>
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
          <div className="max-w-md mx-auto">
            <div className="mb-8 flex items-center justify-between">
              <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
                ● Choose workspace
              </p>
              <button
                onClick={onSignOut}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
              >
                Sign out
              </button>
            </div>
            <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground mb-2">
              Where to today?
            </h1>
            <p className="text-sm text-muted-foreground mb-10">
              You belong to multiple workspaces. Pick one to continue.
            </p>

            {error && (
              <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {error}
              </div>
            )}

            {memberships === null ? (
              <p className="text-sm text-muted-foreground">Loading workspaces…</p>
            ) : (
              <ul className="space-y-3">
                {memberships.map((m) => {
                  const isLast = m.organization_id === lastActiveOrgId
                  const orgSlug = m.organizations?.slug ?? "unknown"
                  const orgName = m.organizations?.name ?? orgSlug
                  return (
                    <li key={m.organization_id}>
                      <button
                        onClick={() => onPick(m.organization_id, orgSlug)}
                        disabled={pickingId !== null}
                        className="group w-full text-left rounded-md border border-border bg-background p-4 hover:border-foreground/40 hover:bg-muted/50 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-medium text-foreground">
                                {orgName}
                              </span>
                              {isLast && (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                                  Last visited
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              lende.shipbyx.com/{orgSlug} · {m.role}
                            </p>
                          </div>
                          <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                            {pickingId === m.organization_id ? "…" : "→"}
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-10 pt-6 border-t border-border text-center">
              <p className="text-xs text-muted-foreground">
                Need to add a workspace?{" "}
                <Link
                  href="/signup"
                  className="text-foreground hover:underline underline-offset-4"
                >
                  Start a new trial
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

/** Validate next-path: must be `/<knownSlug>/...` to prevent open redirects. */
function isSafeNext(next: string | null, ownSlug: string): boolean {
  if (!next) return false
  if (!next.startsWith("/")) return false
  // disallow protocol-relative or full URLs
  if (next.startsWith("//")) return false
  // require it begins with /<ownSlug>/
  return next === `/${ownSlug}` || next.startsWith(`/${ownSlug}/`)
}
