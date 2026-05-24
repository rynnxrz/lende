'use client'

import { useState } from 'react'
import SettingsForm from './SettingsForm'
import ProfileList from './ProfileList'
import CommunicationsTab from './CommunicationsTab'
import CatalogSetupManager from './components/CatalogSetupManager'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import type { BillingProfile, Category, Collection } from '@/types'

interface SettingsClientProps {
    initialTab: string
    settings: {
        contact_email: string | null
        email_approval_body: string | null
        email_footer: string | null
        email_shipping_subject: string | null
        email_shipping_body: string | null
        email_shipping_footer: string | null
        invoice_company_header: string | null
        invoice_footer_text: string | null
        invoice_notes_default: string | null
        turnaround_buffer: number
        booking_password: string | null
    }
    billingProfiles: BillingProfile[]
    categories: Category[]
    collections: Collection[]
}

type TabType = 'billing' | 'communications' | 'catalog' | 'system'

export default function SettingsClient({ initialTab, settings, billingProfiles, categories, collections }: SettingsClientProps) {
    const normalizedInitialTab = initialTab === 'taxonomy' ? 'catalog' : initialTab
    const [activeTab, setActiveTab] = useState<TabType>(normalizedInitialTab as TabType || 'billing')

    return (
        <div className="space-y-6">
            <AdminPageHeader title="Settings" />

            {/* Main Tab Navigation - Client-side switching */}
            <div className="border-b border-border">
                <nav className="flex gap-6">
                    <button
                        onClick={() => setActiveTab('billing')}
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'billing'
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-input'
                            }`}
                    >
                        Billing Profiles
                    </button>
                    <button
                        onClick={() => setActiveTab('communications')}
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'communications'
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-input'
                            }`}
                    >
                        Communications
                    </button>
                    <button
                        onClick={() => setActiveTab('catalog')}
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'catalog'
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-input'
                            }`}
                    >
                        Catalog Setup
                    </button>
                    <button
                        onClick={() => setActiveTab('system')}
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'system'
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-input'
                            }`}
                    >
                        System
                    </button>
                </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'billing' && (
                <ProfileList profiles={billingProfiles} />
            )}

            {activeTab === 'communications' && (
                <CommunicationsTab
                    initialSettings={{
                        contact_email: settings.contact_email,
                        email_approval_body: settings.email_approval_body,
                        email_footer: settings.email_footer,
                        email_shipping_subject: settings.email_shipping_subject,
                        email_shipping_body: settings.email_shipping_body,
                        email_shipping_footer: settings.email_shipping_footer,
                        invoice_company_header: settings.invoice_company_header,
                        invoice_footer_text: settings.invoice_footer_text,
                        invoice_notes_default: settings.invoice_notes_default,
                    }}
                    billingProfiles={billingProfiles.map(p => ({
                        id: p.id,
                        profile_name: p.profile_name,
                        company_header: p.company_header,
                        bank_info: p.bank_info,
                    }))}
                    onSwitchToBilling={() => setActiveTab('billing')}
                />
            )}

            {activeTab === 'catalog' && (
                <CatalogSetupManager categories={categories} collections={collections} />
            )}

            {activeTab === 'system' && (
                <SettingsForm initialSettings={{
                    turnaround_buffer: settings.turnaround_buffer ?? 1,
                    contact_email: settings.contact_email,
                    booking_password: settings.booking_password,
                }} />
            )}
        </div>
    )
}
