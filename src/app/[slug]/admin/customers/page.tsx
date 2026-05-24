import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function OrgCustomersPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const basePath = `/${slug}/admin`
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const orgId = user?.app_metadata?.current_org_id as string | undefined

    type CustomerProfile = {
        id: string
        full_name: string | null
        email: string | null
        company_name: string | null
        organization_domain: string | null
        created_at: string
    }

    let customers: CustomerProfile[] = []
    let error: { message: string } | null = null

    if (orgId) {
        const { data: rows, error: queryError } = await supabase
            .from('reservations')
            .select('renter_id, profiles:profiles!reservations_renter_id_fkey(id, full_name, email, company_name, organization_domain, created_at)')
            .eq('organization_id', orgId)
        error = queryError
        const seen = new Set<string>()
        for (const row of rows ?? []) {
            const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
            if (!profile || seen.has(profile.id)) continue
            seen.add(profile.id)
            customers.push(profile as CustomerProfile)
        }
        customers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    if (error) console.error('Error fetching customers:', error)

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Customers"
                description={`${customers?.length || 0} customer${(customers?.length || 0) !== 1 ? 's' : ''} registered`}
            />
            <Card>
                <CardContent className="pt-6">
                    {customers && customers.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Domain</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {customers.map((customer) => (
                                    <TableRow key={customer.id}>
                                        <TableCell className="font-medium text-sm">{customer.full_name || '—'}</TableCell>
                                        <TableCell className="text-sm">
                                            {customer.email ? (
                                                <Link href={`${basePath}/reservations?customer=${encodeURIComponent(customer.email)}`} className="text-blue-600 hover:underline">
                                                    {customer.email}
                                                </Link>
                                            ) : '—'}
                                        </TableCell>
                                        <TableCell className="text-sm">{customer.company_name || '—'}</TableCell>
                                        <TableCell>
                                            {customer.organization_domain ? (
                                                <Badge variant="secondary" className="font-mono text-xs">{customer.organization_domain}</Badge>
                                            ) : <span className="text-muted-foreground/70">—</span>}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                            <p>No customers yet</p>
                            <p className="text-sm mt-1">Customers will appear here when they submit booking requests.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
