import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
    draft: 'Draft',
    reviewing: 'Reviewing',
    published: 'Published',
}

export default async function LookbooksIndexPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const headerList = await headers()
    const orgSlug = headerList.get('x-org-slug')
    if (!orgSlug) notFound()

    const service = createServiceClient()
    const { data: org } = await service
        .from('organizations')
        .select('id, name')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) notFound()

    const { data: lookbooks } = await service
        .from('pdf_lookbooks')
        .select('id, slug, title, page_count, published, editor_status, updated_at')
        .eq('organization_id', org.id)
        .order('updated_at', { ascending: false })

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Lookbooks</h1>
                    <p className="text-sm text-slate-500">
                        Digitised PDF catalogues — paste hot-zones over each product so customers can tap
                        to view &amp; reserve.
                    </p>
                </div>
            </header>

            {(!lookbooks || lookbooks.length === 0) && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                    No lookbooks yet. Run{' '}
                    <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">
                        npx tsx scripts/lookbook-ingest.ts
                    </code>{' '}
                    to ingest your first PDF.
                </div>
            )}

            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                {(lookbooks ?? []).map(lb => (
                    <li key={lb.id} className="flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{lb.title}</p>
                            <p className="text-xs text-slate-500">
                                {lb.page_count ?? 0} pages · {STATUS_LABEL[lb.editor_status] ?? lb.editor_status}
                                {lb.published ? ' · Live' : ''}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {lb.published && (
                                <Link
                                    href={`/${orgSlug}/lookbook/${lb.slug}`}
                                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                                    target="_blank"
                                >
                                    View Live
                                </Link>
                            )}
                            <Link
                                href={`/${orgSlug}/admin/lookbooks/${lb.id}/editor`}
                                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            >
                                Open Editor
                            </Link>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}
