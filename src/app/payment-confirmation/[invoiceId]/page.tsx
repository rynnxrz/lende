import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import PaymentConfirmationClient from './PaymentConfirmationClient'
import { fetchPaymentConfirmationData } from '@/lib/invoice/document'
import { IVY_PAYMENT_CONTEXT_COPY } from '@/lib/constants/loan-form'
import { BRAND_NAME } from '@/lib/constants/brand'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ invoiceId: string }>
}

export default async function PaymentConfirmationPage({ params }: PageProps) {
  const { invoiceId } = await params
  const supabase = createServiceClient()
  const subtitle = IVY_PAYMENT_CONTEXT_COPY.replace(
    /^Action Required:\s*Review Agreement & Confirm Payment\.\s*/i,
    ''
  )

  const { data: invoice, error } = await fetchPaymentConfirmationData(supabase, invoiceId)

  if (error || !invoice) {
    notFound()
  }

  return (
    <main id="main-content" className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">
          Loan Agreement & Payment Confirmation
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          {subtitle}
        </p>
        {invoice.contractDetails.hasDateModification && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 shadow-sm">
            <p className="text-sm font-medium leading-6 text-amber-950">
              ⚠️ Important Update: {BRAND_NAME} has modified your requested rental dates based on
              availability. Please carefully review the Confirmed Loan Details below before signing.
            </p>
          </div>
        )}
      </div>

      <PaymentConfirmationClient
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        customerName={invoice.customerName}
        customerEmail={invoice.customerEmail}
        customerAddressLines={invoice.customerAddressLines}
        issueDate={invoice.issueDate}
        notes={invoice.notes}
        lineItems={invoice.lineItems}
        subtotalAmount={invoice.subtotalAmount}
        discountPercentage={invoice.discountPercentage}
        discountAmount={invoice.discountAmount}
        depositAmount={invoice.depositAmount}
        totalDue={invoice.totalDue}
        pdfUrl={`/payment-confirmation/${invoice.id}/pdf`}
        status={invoice.status}
        contractDetails={invoice.contractDetails}
      />
    </main>
  )
}
