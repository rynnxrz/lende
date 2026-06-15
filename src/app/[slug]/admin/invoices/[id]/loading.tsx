import { AdminLoading } from '@/components/admin/AdminLoading'

export default function Loading() {
    return (
        <AdminLoading
            title="Invoice"
            description="Loading invoice details..."
            showAction={false}
        />
    )
}
