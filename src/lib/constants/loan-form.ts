/**
 * Loan-form copy & legal document structure.
 *
 * Brand-specific strings (studio name, instagram, contact) are read from
 * src/lib/constants/brand.ts (env-driven). For the legacy single-tenant
 * deployment, set NEXT_PUBLIC_BRAND_* env vars to render the studio's
 * branded loan form. Default fallback = 'lende' / D1 product name.
 *
 * BRIEF-07 — brand-name string scrub（2026-05-02）
 * BRIEF-03 follow-up: when org context lands, replace these constants with
 * a function that takes (organization) and returns a per-tenant document.
 */

import {
  BRAND_NAME,
  BRAND_NAME_UPPER,
  BRAND_INSTAGRAM,
  BRAND_CONTACT_EMAIL,
  BRAND_PHONE,
  BRAND_ADDRESS_LINES,
} from './brand'

export const IVY_PAYMENT_CONTEXT_COPY =
  'Action Required: Review Agreement & Confirm Payment. Please transfer the total amount to the bank account below, review the rental terms, and provide your signature to secure your reservation. Items will only be dispatched after payment is received.'

export const IVY_BANK_DETAILS = {
  bankName: 'Monzo',
  accountName: 'Ivy',
  accountNumber: '12138',
} as const

type LoanFormSection = {
  readonly title: string
  readonly bullets: readonly string[]
}

type LoanFormDocument = {
  readonly brand: string
  readonly title: string
  readonly sections: readonly LoanFormSection[]
  readonly fields: readonly string[]
  readonly contactLines: readonly string[]
}

export const IVY_LOAN_FORM_DOCUMENT: LoanFormDocument = {
  brand: BRAND_NAME_UPPER,
  title: 'LOAN FORM',
  sections: [
    {
      title: '1. Stylist Collection Responsibility:',
      bullets: [
        'The stylist or production team is responsible for organizing the collection of the loaned pieces via email or Instagram communication.',
        'All collection, courier, and return shipping costs must be covered by the stylist or production.',
      ],
    },
    {
      title: '2. Repair and Replacement Liability:',
      bullets: [
        'The stylist is responsible for the cost of repairing or replacing any lost or damaged pieces.',
        'The designer must inform the stylist of any previous damages or special care instructions (to be noted in the rental form).',
        'If a piece is beyond repair, the stylist will be charged the full replacement value.',
      ],
    },
    {
      title: '3.Immediate Damage Notification:',
      bullets: [
        `${BRAND_NAME} must be informed immediately of any damage, loss, or issue affecting the loaned items during the loan period.`,
      ],
    },
    {
      title: '4.Jewellery Return:',
      bullets: [
        'All items must be returned on the agreed return date unless an extension has been approved in writing.\nIf an extension is required, the loan form must be updated and re-signed.',
      ],
    },
    {
      title: '5.Signed Documentation:',
      bullets: [
        `All loan documentation must be signed and returned to ${BRAND_NAME} before the pieces are collected.`,
      ],
    },
    {
      title: '6.Design Credit:',
      bullets: [
        'All headpieces used must be credited correctly in both print and digital formats.',
        `Credit must appear as: ${BRAND_NAME}\nInstagram handle: @${BRAND_INSTAGRAM}.`,
      ],
    },
    {
      title: '7.Image Sharing:',
      bullets: [
        `Any behind-the-scenes imagery or final published images featuring ${BRAND_NAME} pieces should be shared with the designer for archival and promotional purposes.`,
      ],
    },
    {
      title: '8. Pricing:',
      bullets: [
        `Rental pricing is outlined in a separate ${BRAND_NAME} Rental Pricing List. Please refer to the pricing form for detailed rental rates.`,
        `Rental fees and/or security deposits may apply and are subject to the discretion of ${BRAND_NAME}. Any applicable charges will be confirmed prior to the loan period`,
      ],
    },
  ],
  fields: [
    'Date of Shoot:',
    'Call-in Date:',
    'Return Date:',
    'Location of Shoot:',
    'Stylist Signature:',
  ],
  contactLines: [
    BRAND_CONTACT_EMAIL,
    BRAND_PHONE,
    ...BRAND_ADDRESS_LINES,
  ].filter((line): line is string => Boolean(line)),
}

export const IVY_LOAN_FORM_ACCEPTANCE_NOTE =
  `Customer confirmed bank transfer and accepted the ${BRAND_NAME} Loan Form Terms & Conditions via the payment confirmation page.`
