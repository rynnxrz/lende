import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * BRIEF-48 step 3 — Tour your org (S3).
 *
 * The tour itself runs as an overlay on the admin dashboard. This page redirects
 * to /<slug>/admin?tour=1 which mounts <OnboardingTour> client component
 * (react-joyride wrapper). If the user is not signed in we send them to the
 * login route.
 */
export default async function OnboardingStep3Page() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login?next=/onboarding/step-3')
    }

    const currentOrgId = user.app_metadata?.current_org_id as string | undefined
    if (!currentOrgId) {
        redirect('/onboarding/step-1')
    }

    const { data: org } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', currentOrgId)
        .single()

    if (!org?.slug) {
        redirect('/onboarding/step-1')
    }

    redirect(`/${org.slug}/admin?tour=1`)
}
