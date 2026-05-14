'use client'

import { useEffect, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { toast } from 'sonner'
import {
  Banknote,
  CheckCircle2,
  Expand,
  ExternalLink,
  Loader2,
  ReceiptText,
  ScrollText,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CustomerServiceWidget } from '@/components/customer-service/CustomerServiceWidget'
import { submitPaymentConfirmation } from './actions'
import {
  IVY_BANK_DETAILS,
  IVY_LOAN_FORM_DOCUMENT,
} from '@/lib/constants/loan-form'
import { BRAND_NAME } from '@/lib/constants/brand'

interface PaymentConfirmationLineItem {
  id: string
  name: string
  description: string | null
  quantity: number
  unitPrice: number
  total: number
}

interface PaymentConfirmationContractDetails {
  clientName: string
  eventLocation: string | null
  confirmedStartDate: string | null
  confirmedEndDate: string | null
  originalStartDate: string | null
  originalEndDate: string | null
  totalRetailValue: number
  hasDateModification: boolean
}

interface PaymentConfirmationClientProps {
  invoiceId: string
  invoiceNumber: string
  customerName: string
  customerEmail: string | null
  customerAddressLines: string[]
  issueDate: string | null
  notes: string | null
  lineItems: PaymentConfirmationLineItem[]
  subtotalAmount: number
  discountPercentage: number
  discountAmount: number
  depositAmount: number
  totalDue: number
  pdfUrl: string
  status: string
  contractDetails: PaymentConfirmationContractDetails
}

const SIGNATURE_PAD_HEIGHT = 224

function formatGbp(amount: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatIssueDate(value: string | null) {
  if (!value) return 'Not set'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

function formatContractDate(value: string | null) {
  if (!value) return 'Not set'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

function ContractDetailRow({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string | null
}) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
      {helper && <p className="mt-1 text-xs leading-5 text-amber-700">{helper}</p>}
    </div>
  )
}

function LoanFormDetailsSection({
  contractDetails,
}: {
  contractDetails: PaymentConfirmationContractDetails
}) {
  const startDateChanged = (
    contractDetails.hasDateModification
    && contractDetails.originalStartDate
    && contractDetails.originalStartDate !== contractDetails.confirmedStartDate
  )
  const endDateChanged = (
    contractDetails.hasDateModification
    && contractDetails.originalEndDate
    && contractDetails.originalEndDate !== contractDetails.confirmedEndDate
  )

  return (
    <div className="space-y-4 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Confirmed Loan Details
        </p>
        <p className="mt-1 text-sm text-slate-600">
          These fields are system-rendered from {BRAND_NAME}&apos;s confirmed reservation record.
        </p>
      </div>
      <div className="grid gap-px overflow-hidden rounded-xl border border-slate-300 bg-slate-300 md:grid-cols-2">
        <ContractDetailRow
          label="Client Name"
          value={contractDetails.clientName || 'Not set'}
        />
        <ContractDetailRow
          label="Shoot / Event Location"
          value={contractDetails.eventLocation || 'Not specified'}
        />
        <ContractDetailRow
          label="Call-in / Start Date"
          value={formatContractDate(contractDetails.confirmedStartDate)}
          helper={startDateChanged
            ? `Originally requested: ${formatContractDate(contractDetails.originalStartDate)}`
            : null}
        />
        <ContractDetailRow
          label="Return Date"
          value={formatContractDate(contractDetails.confirmedEndDate)}
          helper={endDateChanged
            ? `Originally requested: ${formatContractDate(contractDetails.originalEndDate)}`
            : null}
        />
        <div className="md:col-span-2">
          <ContractDetailRow
            label="Total Retail Value"
            value={formatGbp(contractDetails.totalRetailValue)}
          />
        </div>
      </div>
    </div>
  )
}

function LoanFormTermsContent() {
  return (
    <div className="space-y-6 pr-4 text-sm leading-7 text-slate-700">
      {IVY_LOAN_FORM_DOCUMENT.sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <p className="font-semibold text-slate-900">{section.title}</p>
          <ul className="space-y-2">
            {section.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <span className="mt-0.5 text-slate-500">•</span>
                <span className="whitespace-pre-line">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="border-t border-slate-200 pt-4 text-center text-sm text-slate-600">
        {IVY_LOAN_FORM_DOCUMENT.contactLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  )
}

function LoanFormDocumentSection({
  contractDetails,
  fullScreen = false,
}: {
  contractDetails: PaymentConfirmationContractDetails
  fullScreen?: boolean
}) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          {IVY_LOAN_FORM_DOCUMENT.brand}
        </p>
        <p className="mt-1 text-lg font-semibold text-slate-900">
          {IVY_LOAN_FORM_DOCUMENT.title}
        </p>
      </div>

      <LoanFormDetailsSection contractDetails={contractDetails} />

      <div className="rounded-2xl border border-slate-300 bg-[#fbfaf7] p-5 shadow-sm">
        <div className="border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Terms & Conditions
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Review the complete {BRAND_NAME} loan form before signing.
          </p>
        </div>
        <ScrollArea
          className={`mt-5 rounded-xl border border-slate-200 bg-white p-4 ${fullScreen ? 'h-[56vh]' : 'h-72'}`}
        >
          <LoanFormTermsContent />
        </ScrollArea>
      </div>
    </div>
  )
}

export default function PaymentConfirmationClient({
  invoiceId,
  invoiceNumber,
  customerName,
  customerEmail,
  customerAddressLines,
  issueDate,
  notes,
  lineItems,
  subtotalAmount,
  discountPercentage,
  discountAmount,
  depositAmount,
  totalDue,
  pdfUrl,
  status,
  contractDetails,
}: PaymentConfirmationClientProps) {
  const signatureRef = useRef<SignatureCanvas | null>(null)
  const signatureContainerRef = useRef<HTMLDivElement | null>(null)
  const actionsSectionRef = useRef<HTMLDivElement | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [confirmedPaymentTransfer, setConfirmedPaymentTransfer] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [signaturePadWidth, setSignaturePadWidth] = useState(0)
  const [isLoanFormOpen, setIsLoanFormOpen] = useState(false)

  const canSubmit = confirmedPaymentTransfer && acceptedTerms && !isSubmitting
  const completedConfirmations = Number(confirmedPaymentTransfer) + Number(acceptedTerms)

  useEffect(() => {
    const container = signatureContainerRef.current
    if (!container) return

    const updateSignaturePadWidth = () => {
      const nextWidth = Math.floor(container.clientWidth)
      if (nextWidth <= 0) return

      setSignaturePadWidth((currentWidth) => {
        if (currentWidth === nextWidth) return currentWidth
        if (signatureRef.current && !signatureRef.current.isEmpty()) {
          return currentWidth
        }
        return nextWidth
      })
    }

    updateSignaturePadWidth()

    const resizeObserver = new ResizeObserver(() => {
      updateSignaturePadWidth()
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  const clearSignature = () => {
    signatureRef.current?.clear()
  }

  const scrollToSignatureSection = () => {
    actionsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSubmit = async () => {
    if (!confirmedPaymentTransfer || !acceptedTerms) {
      toast.error('Please confirm payment and accept the loan form terms before signing.')
      return
    }

    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      toast.error('Please draw your signature before submitting.')
      return
    }

    const signatureDataUrl = signatureRef.current
      .getTrimmedCanvas()
      .toDataURL('image/png')

    setIsSubmitting(true)
    try {
      const result = await submitPaymentConfirmation({
        invoiceId,
        signatureDataUrl,
        confirmedPaymentTransfer,
        acceptedTerms,
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to submit payment confirmation.')
        return
      }

      setIsSubmitted(true)
      toast.success('Loan form signed and payment confirmation submitted.')
    } catch (error) {
      console.error('Payment confirmation submission failed:', error)
      toast.error('Unexpected error while submitting. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted || status === 'PAID') {
    return (
      <Card className="border-emerald-200 bg-emerald-50 shadow-sm">
        <CardContent className="p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <h2 className="mt-3 text-lg font-semibold text-emerald-950">
            Loan Form Signed & Payment Confirmation Received
          </h2>
          <p className="mt-2 text-sm leading-6 text-emerald-900">
            Invoice <span className="font-semibold">{invoiceNumber}</span> has been recorded.
            {BRAND_NAME} will review the transfer and dispatch the items once payment is verified.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-8 pb-8 lg:pb-32">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                <ReceiptText className="h-4 w-4" />
                Invoice Details
              </CardTitle>
              <p className="mt-2 text-sm text-slate-500">
                Review the invoice summary below before reading the contract terms.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <a href={pdfUrl} target="_blank" rel="noreferrer">
                Open PDF
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Invoice Number
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                  {invoiceNumber}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Issue Date
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {formatIssueDate(issueDate)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Bill To
                </div>
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{customerName}</p>
                  {customerEmail && <p>{customerEmail}</p>}
                  {customerAddressLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
                  <Banknote className="h-4 w-4" />
                  Payment Instructions
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Bank</span>
                    <span className="font-semibold text-slate-900">{IVY_BANK_DETAILS.bankName}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Name</span>
                    <span className="font-semibold text-slate-900">{IVY_BANK_DETAILS.accountName}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Number</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {IVY_BANK_DETAILS.accountNumber}
                    </span>
                  </div>
                  <Separator className="my-2" />
                  <div>
                    Transfer reference:{' '}
                    <span className="font-mono font-semibold text-slate-900">{invoiceNumber}</span>
                  </div>
                  <div>
                    Total due:{' '}
                    <span className="font-semibold text-slate-900">{formatGbp(totalDue)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <div className="min-w-[640px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="px-4">Item</TableHead>
                      <TableHead className="px-4 text-right">Qty</TableHead>
                      <TableHead className="px-4 text-right">Unit Price</TableHead>
                      <TableHead className="px-4 text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="px-4 py-4 align-top whitespace-normal">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          {item.description && (
                            <div className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">
                              {item.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right font-medium text-slate-700">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right font-medium text-slate-700">
                          {formatGbp(item.unitPrice)}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right font-semibold text-slate-900">
                          {formatGbp(item.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-full max-w-sm space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-900">{formatGbp(subtotalAmount)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      Discount ({discountPercentage.toFixed(2)}%)
                    </span>
                    <span className="font-medium text-rose-700">- {formatGbp(discountAmount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Security Deposit</span>
                  <span className="font-medium text-slate-900">{formatGbp(depositAmount)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-base font-semibold text-slate-950">
                  <span>Total Due</span>
                  <span>{formatGbp(totalDue)}</span>
                </div>
              </div>
            </div>

            {notes && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Notes
                </div>
                <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                  {notes}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-300 bg-[#f7f4ee] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900">
              <ScrollText className="h-4 w-4" />
              {IVY_LOAN_FORM_DOCUMENT.brand} {IVY_LOAN_FORM_DOCUMENT.title}
            </CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsLoanFormOpen(true)}>
              Full Screen
              <Expand className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <LoanFormDocumentSection contractDetails={contractDetails} />
          </CardContent>
        </Card>

        <div ref={actionsSectionRef}>
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                <ShieldCheck className="h-4 w-4" />
                Confirmations & Signature
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  <input
                    type="checkbox"
                    checked={confirmedPaymentTransfer}
                    onChange={(event) => setConfirmedPaymentTransfer(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 accent-slate-900"
                  />
                  <span>
                    I confirm that I have transferred the Total Due ({formatGbp(totalDue)}) to the
                    provided bank account.
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 accent-slate-900"
                  />
                  <span>
                    I have read and agree to the {BRAND_NAME} Loan Form Terms & Conditions.
                  </span>
                </label>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold text-slate-900">Digital Signature</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Your signature confirms payment declaration and acceptance of the loan agreement.
                </p>

                <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-2">
                  <div ref={signatureContainerRef} className="h-56 w-full">
                    {signaturePadWidth > 0 && (
                      <SignatureCanvas
                        ref={signatureRef}
                        penColor="#111827"
                        canvasProps={{
                          width: signaturePadWidth,
                          height: SIGNATURE_PAD_HEIGHT,
                          className: 'block h-56 w-full rounded-lg bg-white',
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={clearSignature} disabled={isSubmitting}>
                  Clear Signature
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="bg-slate-900 hover:bg-slate-800"
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Submitting...' : 'Submit Payment Confirmation'}
                </Button>
              </div>

              {!canSubmit && (
                <p className="text-xs text-slate-500">
                  Both confirmations must be checked before the payment confirmation can be submitted.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-4 z-40 hidden px-4 lg:block">
        <div className="mx-auto max-w-4xl">
          <div className="flex min-h-[72px] items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/90">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Signing Progress
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {completedConfirmations === 2
                  ? 'Both confirmations are complete. Continue to the signature section.'
                  : `${completedConfirmations}/2 confirmations complete. Review the contract and finish below.`}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={scrollToSignatureSection} className="shrink-0">
              Jump to Sign
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={isLoanFormOpen} onOpenChange={setIsLoanFormOpen}>
        <DialogContent className="max-w-6xl p-0 sm:max-w-6xl">
          <DialogHeader className="border-b border-slate-200 px-6 py-4">
            <DialogTitle>
              {IVY_LOAN_FORM_DOCUMENT.brand} {IVY_LOAN_FORM_DOCUMENT.title}
            </DialogTitle>
            <DialogDescription>
              Full-screen reading mode for the exact loan form text.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <div className="pt-2">
              <LoanFormDocumentSection contractDetails={contractDetails} fullScreen />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <CustomerServiceWidget
        storageKey={`customer-service:payment:${invoiceId}`}
        baseContext={{
          pageType: 'payment_confirmation',
          path: `/payment-confirmation/${invoiceId}`,
          paymentConfirmation: {
            invoiceId,
            invoiceNumber,
            totalDue,
            subtotalAmount,
            discountAmount,
            depositAmount,
            pdfUrl,
            status,
          },
        }}
        initialIdentityHints={{
          email: customerEmail ?? null,
        }}
      />
    </>
  )
}
