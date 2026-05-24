'use client'

import { useState, useRef, RefObject, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Mail, FileText, Send, User, Gem, Calendar, DollarSign, Hash, Building, CreditCard } from 'lucide-react'
import { updateCommunicationSettings, sendTestEmail } from '@/app/admin/settings/communicationActions'
import { toast } from 'sonner'

interface CommunicationsTabProps {
    initialSettings: {
        contact_email: string | null
        email_approval_body: string | null
        email_footer: string | null
        email_shipping_subject: string | null
        email_shipping_body: string | null
        email_shipping_footer: string | null
        invoice_company_header: string | null
        invoice_footer_text: string | null
        invoice_notes_default: string | null
    }
    billingProfiles: Array<{
        id: string
        profile_name: string
        company_header: string
        bank_info: string
    }>
    onSwitchToBilling?: () => void
}

// Sample data for previews (English)
const PREVIEW_DATA = {
    customerName: 'Jane Doe',
    itemName: 'Signature Diamond Ring',
    startDate: 'Dec 25, 2024',
    endDate: 'Dec 31, 2024',
    totalAmount: '$1,250.00',
    totalDays: '7',
    reservationId: 'INV-2024-001',
    companyName: "Ivy's Rental & Wholesale",
    bankDetails: 'Chase Bank • Account: ****7890',
    invoiceId: 'INV-A1B2C3D4',
}

// Variable configurations for each template
const APPROVAL_VARIABLES = [
    { label: 'Customer Name', placeholder: '{{customerName}}', icon: User },
    { label: 'Item Name', placeholder: '{{itemName}}', icon: Gem },
    { label: 'Start Date', placeholder: '{{startDate}}', icon: Calendar },
    { label: 'End Date', placeholder: '{{endDate}}', icon: Calendar },
    { label: 'Total Amount', placeholder: '{{totalAmount}}', icon: DollarSign },
    { label: 'Total Days', placeholder: '{{totalDays}}', icon: Hash },
]

const SHIPPING_VARIABLES = [
    { label: 'Customer Name', placeholder: '{{customerName}}', icon: User },
    { label: 'Item Name', placeholder: '{{itemName}}', icon: Gem },
    { label: 'Reservation ID', placeholder: '{{reservationId}}', icon: Hash },
    { label: 'Start Date', placeholder: '{{startDate}}', icon: Calendar },
    { label: 'End Date', placeholder: '{{endDate}}', icon: Calendar },
]

const INVOICE_VARIABLES = [
    { label: 'Company Name', placeholder: '{{companyName}}', icon: Building },
    { label: 'Bank Details', placeholder: '{{bankDetails}}', icon: CreditCard },
    { label: 'Invoice ID', placeholder: '{{invoiceId}}', icon: Hash },
]

// Replace placeholders with preview data
function replaceWithPreviewData(template: string): string {
    if (!template) return ''
    return template
        .replace(/\{\{customerName\}\}/g, PREVIEW_DATA.customerName)
        .replace(/\{\{itemName\}\}/g, PREVIEW_DATA.itemName)
        .replace(/\{\{startDate\}\}/g, PREVIEW_DATA.startDate)
        .replace(/\{\{endDate\}\}/g, PREVIEW_DATA.endDate)
        .replace(/\{\{totalAmount\}\}/g, PREVIEW_DATA.totalAmount)
        .replace(/\{\{totalDays\}\}/g, PREVIEW_DATA.totalDays)
        .replace(/\{\{reservationId\}\}/g, PREVIEW_DATA.reservationId)
        .replace(/\{\{companyName\}\}/g, PREVIEW_DATA.companyName)
        .replace(/\{\{bankDetails\}\}/g, PREVIEW_DATA.bankDetails)
        .replace(/\{\{invoiceId\}\}/g, PREVIEW_DATA.invoiceId)
}

// Default templates
const DEFAULTS = {
    approvalBody: `Dear {{customerName}},

Great news! Your reservation for {{itemName}} has been approved.

Please find the attached invoice for your records. Payment instructions are included in the invoice.`,
    approvalFooter: `Best regards,
Ivy's Rental & Wholesale
Contact us for any questions`,
    shippingSubject: `Order Dispatched: {{itemName}}`,
    shippingBody: `Hi {{customerName}},

We are pleased to inform you that your reservation for {{itemName}} has been dispatched.

Rental Period: {{startDate}} to {{endDate}}
Reservation ID: {{reservationId}}`,
    shippingFooter: `Best regards,
Ivy's Rental & Wholesale`,
    invoiceFooter: `Thank you for your business!`,
    invoiceNotes: ``,
}

type SubTab = 'approval' | 'shipping' | 'invoice'

export default function CommunicationsTab({ initialSettings, billingProfiles, onSwitchToBilling }: CommunicationsTabProps) {
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('approval')
    const [isSaving, startSaveTransition] = useTransition()

    // Approval Email state
    const [approvalBody, setApprovalBody] = useState(initialSettings.email_approval_body || DEFAULTS.approvalBody)
    const [approvalFooter, setApprovalFooter] = useState(initialSettings.email_footer || DEFAULTS.approvalFooter)

    // Shipping Email state
    const [shippingSubject, setShippingSubject] = useState(initialSettings.email_shipping_subject || DEFAULTS.shippingSubject)
    const [shippingBody, setShippingBody] = useState(initialSettings.email_shipping_body || DEFAULTS.shippingBody)
    const [shippingFooter, setShippingFooter] = useState(initialSettings.email_shipping_footer || DEFAULTS.shippingFooter)

    // Invoice PDF state
    const [invoiceFooter, setInvoiceFooter] = useState(initialSettings.invoice_footer_text || DEFAULTS.invoiceFooter)
    const [invoiceNotes, setInvoiceNotes] = useState(initialSettings.invoice_notes_default || '')

    // Test email dialog
    const [testEmailOpen, setTestEmailOpen] = useState(false)
    const [testEmailType, setTestEmailType] = useState<'approval' | 'shipping' | 'invoice'>('approval')
    const [testEmailAddress, setTestEmailAddress] = useState('')
    const [isSendingTest, startTestTransition] = useTransition()

    // Refs for form fields - used for click-to-focus from preview
    const approvalBodyRef = useRef<HTMLTextAreaElement>(null)
    const approvalFooterRef = useRef<HTMLTextAreaElement>(null)
    const shippingSubjectRef = useRef<HTMLInputElement>(null)
    const shippingBodyRef = useRef<HTMLTextAreaElement>(null)
    const shippingFooterRef = useRef<HTMLTextAreaElement>(null)
    const invoiceFooterRef = useRef<HTMLInputElement>(null)
    const invoiceNotesRef = useRef<HTMLTextAreaElement>(null)

    // Focus with visual flash effect for click-to-focus feature
    // Includes blue ring + yellow background flash for maximum visibility
    function focusWithFlash(ref: RefObject<HTMLElement | null>) {
        if (!ref.current) return
        ref.current.focus()
        // Blue ring
        ref.current.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2')
        // Yellow background flash
        ref.current.style.backgroundColor = '#fef9c3' // bg-yellow-100
        setTimeout(() => {
            ref.current?.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2')
            if (ref.current) ref.current.style.backgroundColor = ''
        }, 1000)
    }

    async function handleSave() {
        startSaveTransition(() => {
            void (async () => {
                const result = await updateCommunicationSettings({
                    email_approval_body: approvalBody || null,
                    email_footer: approvalFooter || null,
                    email_shipping_subject: shippingSubject || null,
                    email_shipping_body: shippingBody || null,
                    email_shipping_footer: shippingFooter || null,
                    invoice_footer_text: invoiceFooter || null,
                    invoice_notes_default: invoiceNotes || null,
                })

                if (result.error) {
                    toast.error(result.error)
                } else {
                    toast.success('Communication settings saved')
                }
            })()
        })
    }

    function insertVariable(placeholder: string, textareaRef: React.RefObject<HTMLTextAreaElement | null>, setter: (value: string) => void, currentValue: string) {
        const textarea = textareaRef.current
        if (!textarea) return

        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = currentValue.slice(0, start) + placeholder + currentValue.slice(end)

        setter(newValue)

        setTimeout(() => {
            textarea.focus()
            const newCursorPos = start + placeholder.length
            textarea.setSelectionRange(newCursorPos, newCursorPos)
        }, 0)
    }

    async function handleSendTestEmail() {
        if (!testEmailAddress) return

        startTestTransition(() => {
            void (async () => {
                const result = await sendTestEmail({
                    type: testEmailType,
                    toEmail: testEmailAddress,
                    approvalBody: approvalBody || DEFAULTS.approvalBody,
                    approvalFooter: approvalFooter || DEFAULTS.approvalFooter,
                    shippingSubject: shippingSubject || DEFAULTS.shippingSubject,
                    shippingBody: shippingBody || DEFAULTS.shippingBody,
                    shippingFooter: shippingFooter || DEFAULTS.shippingFooter,
                    // Invoice-specific params
                    billingProfileId: billingProfiles[0]?.id,
                    invoiceNotes: invoiceNotes || undefined,
                    invoiceFooter: invoiceFooter || DEFAULTS.invoiceFooter,
                })

                setTestEmailOpen(false)

                if (result.error) {
                    toast.error(result.error)
                } else {
                    const message = (testEmailType === 'approval' || testEmailType === 'invoice')
                        ? 'Test email with invoice PDF sent!'
                        : `Test email sent to ${testEmailAddress}!`
                    toast.success(message)
                }
                setTestEmailAddress('')
            })()
        })
    }

    return (
        <div className="space-y-6">
            {/* Sub-tab Navigation */}
            <div className="flex gap-2 border-b border-border pb-3">
                {[
                    { key: 'approval', label: 'Approval Email', icon: Mail },
                    { key: 'shipping', label: 'Shipping Email', icon: Send },
                    { key: 'invoice', label: 'Invoice PDF', icon: FileText },
                ].map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveSubTab(tab.key as SubTab)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeSubTab === tab.key
                            ? 'bg-primary text-white'
                            : 'text-muted-foreground hover:bg-muted'
                            }`}
                    >
                        <tab.icon className="h-4 w-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Approval Email Tab */}
            {activeSubTab === 'approval' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Editor */}
                    <div className="space-y-5">
                        <Card className="border-border shadow-sm">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg font-light">Approval Email Template</CardTitle>
                                <CardDescription>
                                    Customize the email sent when a reservation is approved.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                {/* Variable Buttons */}
                                <div className="space-y-2">
                                    <Label className="font-normal text-muted-foreground">Magic Tags</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {APPROVAL_VARIABLES.map((v) => (
                                            <Button
                                                key={v.placeholder}
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs gap-1.5 text-muted-foreground border-border hover:bg-muted/50"
                                                onClick={() => insertVariable(v.placeholder, approvalBodyRef, setApprovalBody, approvalBody)}
                                            >
                                                <v.icon className="h-3 w-3" />
                                                {v.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="space-y-2">
                                    <Label htmlFor="approval-body" className="font-normal text-muted-foreground">Email Message</Label>
                                    <Textarea
                                        id="approval-body"
                                        name="approval-body"
                                        ref={approvalBodyRef}
                                        value={approvalBody}
                                        onChange={(e) => setApprovalBody(e.target.value)}
                                        placeholder={DEFAULTS.approvalBody}
                                        rows={8}
                                        className="font-mono text-sm resize-none bg-muted/50 border-border focus:bg-background transition-colors"
                                    />
                                </div>

                                {/* Footer */}
                                <div className="space-y-2">
                                    <Label htmlFor="approval-footer" className="font-normal text-muted-foreground">Signature / Footer</Label>
                                    <Textarea
                                        id="approval-footer"
                                        name="approval-footer"
                                        ref={approvalFooterRef}
                                        value={approvalFooter}
                                        onChange={(e) => setApprovalFooter(e.target.value)}
                                        placeholder={DEFAULTS.approvalFooter}
                                        rows={4}
                                        className="font-mono text-sm resize-none bg-muted/50 border-border focus:bg-background transition-colors"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Preview */}
                    <div className="lg:sticky lg:top-4 h-fit">
                        <EmailPreview
                            type="approval"
                            body={approvalBody || DEFAULTS.approvalBody}
                            footer={approvalFooter || DEFAULTS.approvalFooter}
                            onClickBody={() => focusWithFlash(approvalBodyRef)}
                            onClickFooter={() => focusWithFlash(approvalFooterRef)}
                        />
                        <div className="mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full border-border text-muted-foreground hover:bg-muted/50"
                                onClick={() => {
                                    setTestEmailType('approval')
                                    setTestEmailOpen(true)
                                }}
                            >
                                <Send className="h-4 w-4 mr-2" />
                                Send Test Email
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Shipping Email Tab */}
            {activeSubTab === 'shipping' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Editor */}
                    <div className="space-y-5">
                        <Card className="border-border shadow-sm">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg font-light">Shipping Email Template</CardTitle>
                                <CardDescription>
                                    Customize the email sent when an order is dispatched.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                {/* Variable Buttons */}
                                <div className="space-y-2">
                                    <Label className="font-normal text-muted-foreground">Magic Tags</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {SHIPPING_VARIABLES.map((v) => (
                                            <Button
                                                key={v.placeholder}
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs gap-1.5 text-muted-foreground border-border hover:bg-muted/50"
                                                onClick={() => insertVariable(v.placeholder, shippingBodyRef, setShippingBody, shippingBody)}
                                            >
                                                <v.icon className="h-3 w-3" />
                                                {v.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                {/* Subject */}
                                <div className="space-y-2">
                                    <Label htmlFor="shipping-subject" className="font-normal text-muted-foreground">Subject Line</Label>
                                    <Input
                                        id="shipping-subject"
                                        name="shipping-subject"
                                        ref={shippingSubjectRef}
                                        value={shippingSubject}
                                        onChange={(e) => setShippingSubject(e.target.value)}
                                        placeholder={DEFAULTS.shippingSubject}
                                        className="bg-muted/50 border-border focus:bg-background transition-colors"
                                    />
                                </div>

                                {/* Body */}
                                <div className="space-y-2">
                                    <Label htmlFor="shipping-body" className="font-normal text-muted-foreground">Email Message</Label>
                                    <Textarea
                                        id="shipping-body"
                                        name="shipping-body"
                                        ref={shippingBodyRef}
                                        value={shippingBody}
                                        onChange={(e) => setShippingBody(e.target.value)}
                                        placeholder={DEFAULTS.shippingBody}
                                        rows={8}
                                        className="font-mono text-sm resize-none bg-muted/50 border-border focus:bg-background transition-colors"
                                    />
                                </div>

                                {/* Footer */}
                                <div className="space-y-2">
                                    <Label htmlFor="shipping-footer" className="font-normal text-muted-foreground">Signature / Footer</Label>
                                    <Textarea
                                        id="shipping-footer"
                                        name="shipping-footer"
                                        ref={shippingFooterRef}
                                        value={shippingFooter}
                                        onChange={(e) => setShippingFooter(e.target.value)}
                                        placeholder={DEFAULTS.shippingFooter}
                                        rows={4}
                                        className="font-mono text-sm resize-none bg-muted/50 border-border focus:bg-background transition-colors"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Preview */}
                    <div className="lg:sticky lg:top-4 h-fit">
                        <EmailPreview
                            type="shipping"
                            subject={shippingSubject || DEFAULTS.shippingSubject}
                            body={shippingBody || DEFAULTS.shippingBody}
                            footer={shippingFooter || DEFAULTS.shippingFooter}
                            onClickSubject={() => focusWithFlash(shippingSubjectRef)}
                            onClickBody={() => focusWithFlash(shippingBodyRef)}
                            onClickFooter={() => focusWithFlash(shippingFooterRef)}
                        />
                        <div className="mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full border-border text-muted-foreground hover:bg-muted/50"
                                onClick={() => {
                                    setTestEmailType('shipping')
                                    setTestEmailOpen(true)
                                }}
                            >
                                <Send className="h-4 w-4 mr-2" />
                                Send Test Email
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Invoice PDF Tab */}
            {activeSubTab === 'invoice' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Editor */}
                    <div className="space-y-5">
                        <Card className="border-border shadow-sm">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg font-light">Invoice PDF Settings</CardTitle>
                                <CardDescription>
                                    Configure default values for generated invoices. Company and bank details come from your Billing Profiles.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                {/* Magic Tags Info */}
                                <div className="space-y-2">
                                    <Label className="font-normal text-muted-foreground">Available Variables</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {INVOICE_VARIABLES.map((v) => (
                                            <span
                                                key={v.placeholder}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 border border-border rounded"
                                            >
                                                <v.icon className="h-3 w-3" />
                                                {v.placeholder}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground/70">
                                        These are auto-filled from your billing profile selection at approval time.
                                    </p>
                                </div>

                                {/* Default Notes */}
                                <div className="space-y-2">
                                    <Label htmlFor="invoice-notes" className="font-normal text-muted-foreground">Default Notes</Label>
                                    <Textarea
                                        id="invoice-notes"
                                        name="invoice-notes"
                                        ref={invoiceNotesRef}
                                        value={invoiceNotes}
                                        onChange={(e) => setInvoiceNotes(e.target.value)}
                                        placeholder="Optional notes to include on every invoice..."
                                        rows={4}
                                        className="font-mono text-sm resize-none bg-muted/50 border-border focus:bg-background transition-colors"
                                    />
                                    <p className="text-xs text-muted-foreground/70">
                                        Can be overridden per-reservation during approval.
                                    </p>
                                </div>

                                {/* Footer Text */}
                                <div className="space-y-2">
                                    <Label htmlFor="invoice-footer" className="font-normal text-muted-foreground">Footer Text</Label>
                                    <Input
                                        id="invoice-footer"
                                        name="invoice-footer"
                                        ref={invoiceFooterRef}
                                        value={invoiceFooter}
                                        onChange={(e) => setInvoiceFooter(e.target.value)}
                                        placeholder={DEFAULTS.invoiceFooter}
                                        className="bg-muted/50 border-border focus:bg-background transition-colors"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* PDF Preview */}
                    <div className="lg:sticky lg:top-4 h-fit">
                        <InvoicePdfPreview
                            billingProfile={billingProfiles[0]}
                            footerText={invoiceFooter || DEFAULTS.invoiceFooter}
                            notes={invoiceNotes}
                            onClickNotes={() => focusWithFlash(invoiceNotesRef)}
                            onClickFooter={() => focusWithFlash(invoiceFooterRef)}
                            onSwitchToBilling={onSwitchToBilling}
                        />
                        <div className="mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full border-border text-muted-foreground hover:bg-muted/50"
                                onClick={() => {
                                    setTestEmailType('invoice')
                                    setTestEmailOpen(true)
                                }}
                            >
                                <Send className="h-4 w-4 mr-2" />
                                Send Test Email with PDF
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-border">
                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-primary hover:bg-primary text-white font-normal px-8"
                >
                    {isSaving && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                    Save All Changes
                </Button>
            </div>

            {/* Test Email Dialog */}
            <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Send Test Email</DialogTitle>
                        <DialogDescription>
                            {testEmailType === 'invoice' || testEmailType === 'approval'
                                ? 'Send a test email with a real PDF invoice (2 mock items) to verify formatting.'
                                : 'Send a preview of the shipping email to your inbox.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="test-email">Email Address</Label>
                            <Input
                                id="test-email"
                                type="email"
                                placeholder="ivy@example.com"
                                value={testEmailAddress}
                                onChange={(e) => setTestEmailAddress(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTestEmailOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSendTestEmail}
                            disabled={isSendingTest || !testEmailAddress}
                            className="bg-primary hover:bg-primary"
                        >
                            {isSendingTest && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                            Send Test
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// Email Preview Component
interface EmailPreviewProps {
    type: 'approval' | 'shipping'
    subject?: string
    body: string
    footer: string
    onClickSubject?: () => void
    onClickBody?: () => void
    onClickFooter?: () => void
}

function EmailPreview({ type, subject, body, footer, onClickSubject, onClickBody, onClickFooter }: EmailPreviewProps) {
    return (
        <Card className="border-border shadow-sm">
            <CardHeader className="pb-4">
                <CardTitle className="text-lg font-light">Live Preview</CardTitle>
                <CardDescription className="text-xs text-blue-600">Click any field to edit</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="bg-card rounded-lg border border-border overflow-hidden max-w-md mx-auto font-[-apple-system,BlinkMacSystemFont,Segoe_UI,Roboto,Helvetica_Neue,Arial,sans-serif]">
                    {/* Email Header */}
                    <div className="px-6 py-4 border-b border-border flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-serif italic text-sm">
                            I
                        </div>
                        <div>
                            <div className="text-sm font-medium text-foreground">Ivy&#39;s Rental</div>
                            {subject && (
                                <div
                                    onClick={onClickSubject}
                                    className={onClickSubject ? "text-xs text-muted-foreground cursor-pointer hover:bg-blue-50 hover:outline hover:outline-2 hover:outline-blue-200 rounded px-1 -mx-1 transition-all" : "text-xs text-muted-foreground"}
                                >
                                    {replaceWithPreviewData(subject)}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Email Body */}
                    <div className="px-6 py-6 space-y-4 text-sm text-muted-foreground leading-relaxed font-[-apple-system,BlinkMacSystemFont,Segoe_UI,Roboto,Helvetica_Neue,Arial,sans-serif]">
                        <div
                            onClick={onClickBody}
                            className={onClickBody ? "whitespace-pre-wrap cursor-pointer hover:bg-blue-50 hover:outline hover:outline-2 hover:outline-blue-200 rounded p-2 -m-2 transition-all" : "whitespace-pre-wrap"}
                            style={{ lineHeight: '1.6' }}
                        >
                            {replaceWithPreviewData(body)}
                        </div>

                        {/* Reservation Details Box (only for approval) */}
                        {type === 'approval' && (
                            <div className="bg-muted/50 rounded p-4 border border-border">
                                <div className="space-y-2 text-xs text-muted-foreground">
                                    <div className="flex justify-between border-b border-border pb-2">
                                        <span>Item</span>
                                        <span className="font-medium text-foreground">{PREVIEW_DATA.itemName}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-border pb-2">
                                        <span>Dates</span>
                                        <span className="font-medium text-foreground">{PREVIEW_DATA.startDate} - {PREVIEW_DATA.endDate}</span>
                                    </div>
                                    <div className="flex justify-between pt-1">
                                        <span>Total Amount</span>
                                        <span className="font-medium text-foreground">{PREVIEW_DATA.totalAmount}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {type === 'approval' && (
                            <div className="text-xs text-muted-foreground/70 italic border-l-2 border-border pl-3">
                                * An invoice PDF will be attached to this email.
                            </div>
                        )}

                        {type === 'shipping' && (
                            <div className="bg-muted/50 rounded p-3 border border-border">
                                <p className="text-xs text-muted-foreground">
                                    <strong>📎 Pre-Shipment Documentation:</strong><br />
                                    Dispatch photos will be attached to this email.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Email Footer */}
                    <div
                        onClick={onClickFooter}
                        className={onClickFooter ? "px-6 py-4 bg-muted/50 border-t border-border cursor-pointer hover:bg-blue-50 transition-all" : "px-6 py-4 bg-muted/50 border-t border-border"}
                    >
                        <div className="whitespace-pre-wrap text-xs text-muted-foreground">
                            {replaceWithPreviewData(footer)}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// Invoice PDF Preview Component
interface InvoicePdfPreviewProps {
    billingProfile?: {
        company_header: string
        bank_info: string
    }
    footerText: string
    notes: string
    onClickNotes?: () => void
    onClickFooter?: () => void
    onSwitchToBilling?: () => void
}

function InvoicePdfPreview({ billingProfile, footerText, notes, onClickNotes, onClickFooter, onSwitchToBilling }: InvoicePdfPreviewProps) {
    // Determine content with fallbacks
    const companyHeader = billingProfile?.company_header || "Ivy's Rental & Wholesale\n123 Fashion Ave, New York, NY"

    const bankInfo = billingProfile?.bank_info || "Chase Bank\nAccount: 1234567890\nRouting: 098765432"

    return (
        <Card className="border-border shadow-sm">
            <CardHeader className="pb-4">
                <CardTitle className="text-lg font-light">Invoice Preview</CardTitle>
                <CardDescription className="text-xs text-blue-600">
                    Click blue fields to edit here, dashed fields to edit in Billing
                </CardDescription>
            </CardHeader>
            <CardContent>
                {/* PDF-like container */}
                <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm font-[-apple-system,BlinkMacSystemFont,Segoe_UI,Roboto,Helvetica_Neue,Arial,sans-serif]" style={{ aspectRatio: '8.5/11' }}>
                    <div className="p-6 h-full flex flex-col text-xs">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6 pb-4 border-b border-border">
                            <div>
                                <h1 className="text-lg font-bold text-foreground mb-2">INVOICE</h1>
                                <div
                                    className="text-muted-foreground whitespace-pre-line text-[10px] cursor-pointer hover:border-dashed hover:border-muted-foreground border border-transparent p-1 -m-1 rounded transition-all group relative"
                                    onClick={onSwitchToBilling}
                                    title="Click to edit in Billing Profiles"
                                >
                                    {companyHeader}
                                    <div className="absolute top-0 right-0 hidden group-hover:block bg-primary text-white text-[9px] px-1 rounded shadow-sm whitespace-nowrap z-10 pointer-events-none">
                                        Edit in Billing Profiles →
                                    </div>
                                </div>
                            </div>
                            <div className="text-right text-muted-foreground">
                                <div className="group relative cursor-help">
                                    Invoice #: {PREVIEW_DATA.invoiceId}
                                    <div className="hidden group-hover:block absolute right-0 bg-primary text-white text-[9px] p-2 rounded shadow-lg z-10 w-40 text-left pointer-events-none">
                                        Invoice numbers are generated automatically based on reservation ID.
                                    </div>
                                </div>
                                <div className="group relative cursor-help mt-1">
                                    Date: Dec 20, 2024
                                    <div className="hidden group-hover:block absolute right-0 bg-primary text-white text-[9px] p-2 rounded shadow-lg z-10 w-40 text-left pointer-events-none">
                                        Date is generated automatically when invoice is created.
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bill To */}
                        <div className="mb-4">
                            <h2 className="text-[10px] font-semibold text-foreground mb-1 uppercase tracking-wider">Bill To</h2>
                            <div className="text-muted-foreground">
                                <div>{PREVIEW_DATA.customerName}</div>
                                <div>jane.doe@example.com</div>
                            </div>
                        </div>

                        {/* Item Details */}
                        <div className="mb-4">
                            <h2 className="text-[10px] font-semibold text-foreground mb-2 uppercase tracking-wider">Reservation Details</h2>
                            <div className="flex gap-3">
                                <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-muted-foreground/70">
                                    <Gem className="h-5 w-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between border-b border-border py-1">
                                        <span className="text-muted-foreground">Item</span>
                                        <span className="text-foreground">{PREVIEW_DATA.itemName}</span>
                                    </div>
                                    <div className="flex justify-between py-1">
                                        <span className="text-muted-foreground">Period</span>
                                        <span className="text-foreground">{PREVIEW_DATA.startDate} - {PREVIEW_DATA.endDate}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Total */}
                        <div className="mb-4 py-2 border-t-2 border-primary">
                            <div className="flex justify-between font-semibold">
                                <span>Total Due</span>
                                <span>{PREVIEW_DATA.totalAmount}</span>
                            </div>
                        </div>

                        {/* Payment Info */}
                        <div className="mb-4">
                            <h2 className="text-[10px] font-semibold text-foreground mb-1 uppercase tracking-wider">Payment Instructions</h2>
                            <div
                                className="text-muted-foreground text-[10px] whitespace-pre-line cursor-pointer hover:border-dashed hover:border-muted-foreground border border-transparent p-1 -m-1 rounded transition-all group relative"
                                onClick={onSwitchToBilling}
                                title="Click to edit in Billing Profiles"
                            >
                                {bankInfo}
                                <div className="absolute top-0 right-0 hidden group-hover:block bg-primary text-white text-[9px] px-1 rounded shadow-sm whitespace-nowrap z-10 pointer-events-none">
                                    Edit in Billing Profiles →
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        <div
                            onClick={onClickNotes}
                            className={onClickNotes ? "mb-4 cursor-pointer hover:bg-blue-50 hover:outline hover:outline-2 hover:outline-blue-200 rounded p-1 -m-1 transition-all" : "mb-4"}
                        >
                            <h2 className="text-[10px] font-semibold text-foreground mb-1 uppercase tracking-wider">Notes</h2>
                            <div className="text-muted-foreground text-[10px]">{notes || '(click to add notes)'}</div>
                        </div>

                        {/* Footer */}
                        <div
                            onClick={onClickFooter}
                            className={onClickFooter ? "mt-auto pt-4 text-center text-muted-foreground/70 text-[10px] cursor-pointer hover:bg-blue-50 hover:outline hover:outline-2 hover:outline-blue-300 rounded p-1 transition-all border border-transparent" : "mt-auto pt-4 text-center text-muted-foreground/70 text-[10px]"}
                        >
                            {footerText || <span className="text-muted-foreground/50 italic">(click to add footer text)</span>}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
