import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Daily ping to keep the Supabase project active and avoid free-tier
 * auto-pause after 7 days of inactivity.
 *
 * Manual trigger for testing:
 *   curl localhost:3000/api/cron/keep-alive \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()

    const { error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1)

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() })
}
