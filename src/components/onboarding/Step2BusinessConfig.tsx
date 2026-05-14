'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * BRIEF-05 step 2 — Business config.
 *
 * Currency / turnaround days / contact email. Saved into
 * organizations.settings JSONB by the wizard's server action.
 */

export interface Step2BusinessConfigData {
    currency: string
    turnaroundDays: number
    contactEmail: string
}

export interface Step2BusinessConfigProps {
    initial?: Partial<Step2BusinessConfigData>
    onComplete: (data: Step2BusinessConfigData) => void
}

const CURRENCIES = ['NZD', 'AUD', 'USD', 'GBP', 'EUR', 'CNY', 'JPY']

export function Step2BusinessConfig({ initial, onComplete }: Step2BusinessConfigProps) {
    const [currency, setCurrency] = useState(initial?.currency ?? 'NZD')
    const [turnaroundDays, setTurnaroundDays] = useState(initial?.turnaroundDays ?? 3)
    const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? '')

    const valid =
        contactEmail.includes('@') &&
        turnaroundDays >= 0 &&
        turnaroundDays <= 90

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Set defaults for new bookings. You can override per-product later.
            </p>

            <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <select
                    id="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="turnaround">Turnaround days (between rentals)</Label>
                <Input
                    id="turnaround"
                    type="number"
                    min={0}
                    max={90}
                    value={turnaroundDays}
                    onChange={(e) => setTurnaroundDays(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                    Days you need to clean, inspect, and re-list a returned item.
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="contactEmail">Contact email (shown to customers)</Label>
                <Input
                    id="contactEmail"
                    type="email"
                    placeholder="hello@studio.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                />
            </div>

            <Button
                type="button"
                disabled={!valid}
                onClick={() =>
                    onComplete({ currency, turnaroundDays, contactEmail: contactEmail.trim() })
                }
                className="w-full"
            >
                Continue
            </Button>
        </div>
    )
}
