import Link from 'next/link'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Plus, FileText, Download, Pencil } from 'lucide-react'
import { withServerTiming } from '@/lib/admin/perf'
import { getOrgAdminContext } from '@/lib/admin/org-context'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ filter?: string; page?: string }>
}

type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'VOID' | 'OVERDUE'

interface Invoice {
    id: string
    invoice_number: string
    category: string
    customer_name: string
    customer_email: string | null
    total_amount: number
    issue_date: string
    due_date: string | null
    status: InvoiceStatus
    created_at: string
}

const PAGE_SIZE = 100

export default async function OrgInvoicesPage({ params, searchParams }: PageProps) {
    const { slug } = await params
    const basePath = `/${slug}/admin`
    const resolvedParams = await searchParams
    const filter = resolvedParams.filter || 'all'
    const currentPage = Math.max(1, Number(resolvedParams.page ?? 1) || 1)
    const from = (currentPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { supabase, org } = await getOrgAdminContext(slug)
    const orgId = org.id

    let query = supabase
        .from('invoices')
        .select('id, invoice_number, category, customer_name, customer_email, total_amount, issue_date, due_date, status, created_at')
        .order('created_at', { ascending: false })
        .range(from, to)

    if (orgId) query = query.eq('organization_id', orgId)

    if (filter === 'unpaid') {
        query = query.in('status', ['DRAFT', 'SENT', 'OVERDUE'])
    } else if (filter === 'paid') {
        query = query.eq('status', 'PAID')
    }

    const { data: invoices, error } = await withServerTiming('invoices:list', async () => await query)

    if (error) {
        console.error('Error fetching invoices full:', error)
        return (
            <div className="text-red-500">
                <h3 className="font-bold">Error loading invoices</h3>
                <pre className="bg-muted p-2 rounded text-xs mt-2 overflow-auto">
                    {JSON.stringify(error, null, 2)}
                </pre>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-semibold text-foreground">Invoices</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage invoices for rentals, wholesale, and services
                    </p>
                </div>

                <Link href={`${basePath}/invoices/new`}>
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        New Invoice
                    </Button>
                </Link>
            </div>

            <div className="flex p-1 bg-muted rounded-lg w-fit">
                <FilterTab label="All Invoices" active={filter === 'all'} href={`${basePath}/invoices?filter=all`} />
                <FilterTab label="Unpaid" active={filter === 'unpaid'} href={`${basePath}/invoices?filter=unpaid`} />
                <FilterTab label="Paid" active={filter === 'paid'} href={`${basePath}/invoices?filter=paid`} />
            </div>

            <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
                <InvoicesTable invoices={(invoices as Invoice[]) || []} basePath={basePath} />
            </div>
            <PaginationControls
                basePath={basePath}
                filter={filter}
                currentPage={currentPage}
                hasNext={(invoices?.length ?? 0) === PAGE_SIZE}
            />
        </div>
    )
}

function FilterTab({ label, active, href }: { label: string; active: boolean; href: string }) {
    return (
        <Link
            href={href}
            className={`
                px-4 py-2 text-sm font-medium rounded-md transition-all
                ${active
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }
            `}
        >
            {label}
        </Link>
    )
}

function InvoicesTable({ invoices, basePath }: { invoices: Invoice[]; basePath: string }) {
    if (invoices.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground/70">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No invoices found.</p>
                <Link href={`${basePath}/invoices/new`} className="text-blue-600 hover:underline mt-2 inline-block">
                    Create your first invoice
                </Link>
            </div>
        )
    }

    return (
        <Table>
            <TableHeader>
                <TableRow className="bg-muted/50">
                    <TableHead className="w-48">Invoice #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {invoices.map((invoice) => (
                    <TableRow key={invoice.id} className="group">
                        <TableCell>
                            <Link
                                href={`${basePath}/invoices/${invoice.id}`}
                                className="font-mono text-sm hover:text-blue-600 transition-colors"
                            >
                                {invoice.invoice_number}
                            </Link>
                            <div className="text-xs text-muted-foreground/70 mt-1">
                                {getCategoryLabel(invoice.category)}
                            </div>
                        </TableCell>
                        <TableCell>
                            <StatusBadge status={invoice.status} />
                        </TableCell>
                        <TableCell>
                            <div className="font-medium text-foreground text-sm">
                                {invoice.customer_name}
                            </div>
                            {invoice.customer_email && (
                                <div className="text-xs text-muted-foreground/70">
                                    {invoice.customer_email}
                                </div>
                            )}
                        </TableCell>
                        <TableCell>
                            <span className="text-sm text-muted-foreground">Open invoice</span>
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                            £{invoice.total_amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                            <div className="text-sm text-foreground">
                                {format(new Date(invoice.issue_date), 'MMM dd, yyyy')}
                            </div>
                            {invoice.due_date && (
                                <div className="text-xs text-muted-foreground/70">
                                    Due: {format(new Date(invoice.due_date), 'MMM dd')}
                                </div>
                            )}
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="flex gap-1 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                                <Link href={`${basePath}/invoices/${invoice.id}`}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                </Link>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Download PDF">
                                    <Download className="h-4 w-4" />
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
    const styles: Record<InvoiceStatus, string> = {
        DRAFT: 'bg-muted text-foreground border-border',
        SENT: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        PAID: 'bg-green-100 text-green-800 border-green-200',
        VOID: 'bg-purple-100 text-purple-700 border-purple-200',
        OVERDUE: 'bg-red-100 text-red-800 border-red-200',
    }

    const labels: Record<InvoiceStatus, string> = {
        DRAFT: 'Draft',
        SENT: 'Sent',
        PAID: 'Paid',
        VOID: 'Void',
        OVERDUE: 'Overdue',
    }

    return (
        <Badge variant="outline" className={`${styles[status]} text-xs`}>
            {labels[status]}
        </Badge>
    )
}

function getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
        RENTAL: 'Rental',
        WHOLESALE: 'Wholesale',
        MANUAL: 'Manual',
    }
    return labels[category] || category
}

function PaginationControls({
    basePath,
    filter,
    currentPage,
    hasNext,
}: {
    basePath: string
    filter: string
    currentPage: number
    hasNext: boolean
}) {
    if (currentPage === 1 && !hasNext) return null

    const hrefFor = (page: number) => `${basePath}/invoices?filter=${encodeURIComponent(filter)}&page=${page}`
    return (
        <div className="flex items-center justify-end gap-2">
            {currentPage > 1 && (
                <Button asChild variant="outline" size="sm">
                    <Link href={hrefFor(currentPage - 1)}>Previous</Link>
                </Button>
            )}
            {hasNext && (
                <Button asChild variant="outline" size="sm">
                    <Link href={hrefFor(currentPage + 1)}>Next</Link>
                </Button>
            )}
        </div>
    )
}
