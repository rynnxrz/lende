'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { importRequestFromJSON } from './importActions'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'

export function ImportRequestButton() {
    const [open, setOpen] = useState(false)
    const [jsonCode, setJsonCode] = useState('')
    const [forceImport, setForceImport] = useState(false)
    const [isPending, startTransition] = useTransition()

    const handleImport = () => {
        if (!jsonCode.trim()) return

        startTransition(() => {
            void (async () => {
                try {
                    // M2: Handle Base64
                    let payloadStr = jsonCode.trim()
                    try {
                        // Check if it looks like Base64 (no spaces, length multiple of 4 roughly)
                        // Or just try to decode.
                        if (!payloadStr.startsWith('{') && !payloadStr.startsWith('[')) {
                            payloadStr = decodeURIComponent(escape(atob(payloadStr)))
                        }
                    } catch {
                        // Ignore decode error, assume raw JSON
                    }

                    const result = await importRequestFromJSON(payloadStr, forceImport)
                    if (result.error) {
                        toast.error(result.error)
                    } else {
                        toast.success('Request imported successfully')
                        setOpen(false)
                        setJsonCode('')
                    }
                } catch {
                    toast.error('Unexpected error during import')
                }
            })()
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-dashed border-input">
                    <Upload className="h-4 w-4" />
                    Import from Code
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[85vh]">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle>Import Emergency Request</DialogTitle>
                    <DialogDescription>
                        Paste the JSON code from the customer&apos;s email below. This will bypass standard checks and force-create the request.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto py-4 px-1 space-y-4 min-h-0">
                    <Textarea
                        placeholder="{ 'items': ... }"
                        className="font-mono text-xs min-h-[200px] resize-none"
                        value={jsonCode}
                        onChange={(e) => setJsonCode(e.target.value)}
                    />
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="force-import"
                            className="h-4 w-4 rounded border-input text-indigo-600 focus:ring-indigo-500"
                            checked={forceImport}
                            onChange={(e) => setForceImport(e.target.checked)}
                        />
                        <label htmlFor="force-import" className="text-sm text-red-600 font-medium">
                            Force import despite conflicts (Admin Override)
                        </label>
                    </div>
                </div>
                <DialogFooter className="flex-shrink-0 pt-2">
                    <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleImport} disabled={isPending || !jsonCode.trim()}>
                        {isPending ? 'Importing...' : 'Parse & Import'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
