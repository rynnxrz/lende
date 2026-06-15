import SettingsClient from '@/app/admin/settings/SettingsClient'
import type { BillingProfile, Category, Collection } from '@/types'
import { getCategories, getCollections } from '@/app/admin/settings/actions'
import { getOrgAdminContext } from '@/lib/admin/org-context'
import { withServerTiming } from '@/lib/admin/perf'

export const dynamic = 'force-dynamic'

export default async function OrgSettingsPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const { supabase, org } = await getOrgAdminContext(slug)
    const orgId = org.id

    let settingsQuery = supabase.from('app_settings').select('*')
    if (orgId) settingsQuery = settingsQuery.eq('organization_id', orgId)
    let { data: settings } = await settingsQuery.maybeSingle()

    if (!settings) {
        settings = {
            company_name: '', bank_account_info: '', invoice_footer_text: '',
            contact_email: '', turnaround_buffer: 1, booking_password: '',
            email_approval_body: '', email_footer: '', email_shipping_subject: '',
            email_shipping_body: '', email_shipping_footer: '',
            invoice_company_header: '', invoice_notes_default: '',
        }
    }

    let billingProfilesQuery = supabase
        .from('billing_profiles').select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
    if (orgId) billingProfilesQuery = billingProfilesQuery.eq('organization_id', orgId)
    const { data: billingProfiles } = await billingProfilesQuery

    const [categories, collections] = await withServerTiming('settings:taxonomy', () => Promise.all([getCategories(), getCollections()]))

    return (
        <SettingsClient
            initialTab="billing"
            settings={{
                contact_email: settings.contact_email,
                email_approval_body: settings.email_approval_body,
                email_footer: settings.email_footer,
                email_shipping_subject: settings.email_shipping_subject,
                email_shipping_body: settings.email_shipping_body,
                email_shipping_footer: settings.email_shipping_footer,
                invoice_company_header: settings.invoice_company_header,
                invoice_footer_text: settings.invoice_footer_text,
                invoice_notes_default: settings.invoice_notes_default,
                turnaround_buffer: settings.turnaround_buffer ?? 1,
                booking_password: settings.booking_password,
            }}
            billingProfiles={(billingProfiles || []) as BillingProfile[]}
            categories={(categories || []) as Category[]}
            collections={(collections || []) as Collection[]}
        />
    )
}
