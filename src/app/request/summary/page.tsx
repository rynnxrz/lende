import { Suspense } from 'react'
import { headers } from 'next/headers'
import { SummaryClient } from './SummaryClient'

export const dynamic = 'force-dynamic'

const DEFAULT_ORG_SLUG = 'ivyjstudio'

export default async function RequestSummaryPage() {
    const headerList = await headers()
    const orgSlug = (headerList.get('x-org-slug') ?? DEFAULT_ORG_SLUG).toLowerCase()

    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-300 border-r-gray-900"></div>
            </div>
        }>
            <SummaryClient orgSlug={orgSlug} />
        </Suspense>
    )
}
