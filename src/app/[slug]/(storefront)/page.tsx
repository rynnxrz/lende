import Link from "next/link"
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const supabase = createServiceClient()
    const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("slug", slug.toLowerCase())
        .maybeSingle()

    return { title: org?.name ?? slug }
}

export default async function OrgHomePage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const orgSlug = slug.toLowerCase()

    const supabase = createServiceClient()
    const { data: org } = await supabase
        .from("organizations")
        .select("id, slug, name")
        .eq("slug", orgSlug)
        .maybeSingle()

    if (!org) notFound()

    const entries = [
        {
            title: "Rental",
            description: "Current collection",
            href: `/${org.slug}/catalog`,
        },
        {
            title: "Wholesale",
            description: "For partners",
            href: `/${org.slug}/wholesale`,
        },
        {
            title: "Archive",
            description: "Past collection",
            href: `/${org.slug}/archive`,
        },
    ]

    return (
        <main
            id="main-content"
            tabIndex={-1}
            className="min-h-screen bg-white text-slate-900 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100"
        >
            <h1 className="sr-only">{org.name}</h1>

            {entries.map((entry) => (
                <Link
                    key={entry.href}
                    href={entry.href}
                    className="group relative flex flex-1 items-center justify-center min-h-[33vh] md:min-h-screen hover:bg-slate-50 transition-colors duration-500"
                >
                    <div className="text-center px-8">
                        <h2 className="text-3xl md:text-4xl font-light tracking-[0.2em] text-slate-900 mb-4 group-hover:scale-110 transition-transform duration-500">
                            {entry.title.toUpperCase()}
                        </h2>
                        <p className="text-xs text-slate-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-500 delay-100">
                            {entry.description}
                        </p>
                    </div>
                </Link>
            ))}
        </main>
    )
}
