'use client'

import { useState, useTransition } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useFieldArray, useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { createManualInvoice } from '@/actions/invoice'

interface LineItem {
    name: string
    description: string
    quantity: number
    unit_price: number
    total: number
}

interface FormData {
    customer_name: string
    customer_email: string
    notes: string
    items: LineItem[]
}

export default function OrgNewInvoicePage() {
    const router = useRouter()
    const params = useParams<{ slug: string }>()
    const basePath = `/${params.slug}/admin`
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
        defaultValues: {
            customer_name: '',
            customer_email: '',
            notes: '',
            items: [{ name: '', description: '', quantity: 1, unit_price: 0, total: 0 }],
        },
    })

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'items',
    })

    const watchItems = watch('items')

    const subtotal = watchItems.reduce((sum, item) => {
        const total = (item.quantity || 0) * (item.unit_price || 0)
        return sum + total
    }, 0)

    const updateLineTotal = (index: number) => {
        const item = watchItems[index]
        const total = (item.quantity || 0) * (item.unit_price || 0)
        setValue(`items.${index}.total`, total)
    }

    const onSubmit = async (data: FormData) => {
        setError(null)

        const itemsWithTotals = data.items.map(item => ({
            ...item,
            total: item.quantity * item.unit_price,
        }))

        startTransition(async () => {
            const result = await createManualInvoice({
                customer_name: data.customer_name,
                customer_email: data.customer_email || undefined,
                notes: data.notes || undefined,
                items: itemsWithTotals,
            })

            if (result.success) {
                router.push(`${basePath}/invoices`)
            } else {
                setError(result.error || 'Failed to create invoice')
            }
        })
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center gap-4">
                <Link href={`${basePath}/invoices`}>
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-semibold text-foreground">New Invoice</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Create a manual invoice for services or custom one-off charges
                    </p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Customer Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="customer_name">Customer Name *</Label>
                                <Input
                                    id="customer_name"
                                    {...register('customer_name', { required: 'Customer name is required' })}
                                    placeholder="John Doe or Company Name"
                                />
                                {errors.customer_name && (
                                    <p className="text-sm text-red-500">{errors.customer_name.message}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="customer_email">Email</Label>
                                <Input
                                    id="customer_email"
                                    type="email"
                                    {...register('customer_email')}
                                    placeholder="customer@example.com"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-lg">Line Items</CardTitle>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({ name: '', description: '', quantity: 1, unit_price: 0, total: 0 })}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Item
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase border-b pb-2">
                                <div className="col-span-4">Item</div>
                                <div className="col-span-3">Description</div>
                                <div className="col-span-1 text-center">Qty</div>
                                <div className="col-span-2 text-right">Unit Price</div>
                                <div className="col-span-1 text-right">Total</div>
                                <div className="col-span-1"></div>
                            </div>

                            {fields.map((field, index) => {
                                const lineTotal = (watchItems[index]?.quantity || 0) * (watchItems[index]?.unit_price || 0)
                                return (
                                    <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                                        <div className="col-span-4">
                                            <Input
                                                {...register(`items.${index}.name` as const, { required: true })}
                                                placeholder="Service name"
                                                className="h-9"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <Input
                                                {...register(`items.${index}.description` as const)}
                                                placeholder="Description"
                                                className="h-9"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <Input
                                                type="number"
                                                min="1"
                                                {...register(`items.${index}.quantity` as const, {
                                                    valueAsNumber: true,
                                                    min: 1,
                                                    onChange: () => updateLineTotal(index)
                                                })}
                                                className="h-9 text-center"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                {...register(`items.${index}.unit_price` as const, {
                                                    valueAsNumber: true,
                                                    min: 0,
                                                    onChange: () => updateLineTotal(index)
                                                })}
                                                className="h-9 text-right"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="col-span-1 text-right font-medium text-foreground">
                                            £{lineTotal.toFixed(2)}
                                        </div>
                                        <div className="col-span-1 flex justify-end">
                                            {fields.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground/70 hover:text-red-500"
                                                    onClick={() => remove(index)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}

                            <div className="border-t pt-4 mt-4">
                                <div className="flex justify-end">
                                    <div className="w-64 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Subtotal</span>
                                            <span className="font-medium">£{subtotal.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-lg font-bold border-t pt-2">
                                            <span>Total</span>
                                            <span>£{subtotal.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            {...register('notes')}
                            placeholder="Internal notes or footer text for the invoice..."
                            rows={3}
                        />
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-3">
                    <Link href={`${basePath}/invoices`}>
                        <Button type="button" variant="outline">
                            Cancel
                        </Button>
                    </Link>
                    <Button type="submit" disabled={isPending} className="gap-2">
                        <Save className="h-4 w-4" />
                        {isPending ? 'Creating...' : 'Save Draft'}
                    </Button>
                </div>
            </form>
        </div>
    )
}
