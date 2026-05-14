/* eslint-disable no-console */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as React from 'react'
import { render } from '@react-email/render'

import { OnboardingDay0 } from '../src/lib/email/templates/onboarding-day-0'
import { OnboardingDay1 } from '../src/lib/email/templates/onboarding-day-1'
import { OnboardingDay3 } from '../src/lib/email/templates/onboarding-day-3'
import { OnboardingDay7 } from '../src/lib/email/templates/onboarding-day-7'
import { OnboardingDay9 } from '../src/lib/email/templates/onboarding-day-9'
import { OnboardingDay11 } from '../src/lib/email/templates/onboarding-day-11'
import { OnboardingDay13 } from '../src/lib/email/templates/onboarding-day-13'

const SAMPLE_ORG = 'IvyJSTUDIO'
const SAMPLE_SLUG = 'ivyjstudio'
const SAMPLE_FIRST_NAME = 'Ivy'
const SITE_URL = 'https://lende.shipbyx.com'
const ADMIN_URL = `${SITE_URL}/${SAMPLE_SLUG}/admin`
const PRICING_URL = `${SITE_URL}/pricing`
const UNSUB_URL = `${SITE_URL}/unsubscribe?token=preview-token`

const cases: Array<{
    day: number
    element: React.ReactElement
}> = [
    {
        day: 0,
        element: React.createElement(OnboardingDay0, {
            orgName: SAMPLE_ORG,
            adminUrl: ADMIN_URL,
            siteUrl: SITE_URL,
            firstName: SAMPLE_FIRST_NAME,
            unsubscribeUrl: UNSUB_URL,
        }),
    },
    {
        day: 1,
        element: React.createElement(OnboardingDay1, {
            orgName: SAMPLE_ORG,
            adminUrl: ADMIN_URL,
            siteUrl: SITE_URL,
            firstName: SAMPLE_FIRST_NAME,
            unsubscribeUrl: UNSUB_URL,
        }),
    },
    {
        day: 3,
        element: React.createElement(OnboardingDay3, {
            orgName: SAMPLE_ORG,
            adminUrl: ADMIN_URL,
            siteUrl: SITE_URL,
            unsubscribeUrl: UNSUB_URL,
        }),
    },
    {
        day: 7,
        element: React.createElement(OnboardingDay7, {
            orgName: SAMPLE_ORG,
            adminUrl: ADMIN_URL,
            siteUrl: SITE_URL,
            listingCount: 8,
            reservationCount: 3,
            unsubscribeUrl: UNSUB_URL,
        }),
    },
    {
        day: 9,
        element: React.createElement(OnboardingDay9, {
            orgName: SAMPLE_ORG,
            pricingUrl: PRICING_URL,
            siteUrl: SITE_URL,
            unsubscribeUrl: UNSUB_URL,
        }),
    },
    {
        day: 11,
        element: React.createElement(OnboardingDay11, {
            orgName: SAMPLE_ORG,
            pricingUrl: PRICING_URL,
            siteUrl: SITE_URL,
            weekReservations: 12,
            listings: 18,
            teamSize: 3,
            firstName: SAMPLE_FIRST_NAME,
            unsubscribeUrl: UNSUB_URL,
        }),
    },
    {
        day: 13,
        element: React.createElement(OnboardingDay13, {
            orgName: SAMPLE_ORG,
            pricingUrl: PRICING_URL,
            siteUrl: SITE_URL,
            listingCount: 8,
            unsubscribeUrl: UNSUB_URL,
        }),
    },
]

const outDir = resolve(process.cwd(), 'tracker/brief-52-email-html')

async function main() {
    for (const { day, element } of cases) {
        const html = await render(element, { pretty: true })
        const outPath = resolve(outDir, `day-${day}.html`)
        writeFileSync(outPath, html, 'utf-8')
        console.log(`✓ wrote ${outPath} (${html.length} bytes)`)
    }
    console.log(`\nAll ${cases.length} templates rendered.`)
}

main().catch((err) => {
    console.error('render failed:', err)
    process.exit(1)
})
