'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

/**
 * BRIEF-05 step 1 — Branding (display name confirmation + logo upload).
 *
 * The store name was captured at signup and is shown for confirmation
 * (read-only here — name changes happen in Settings later). Logo upload
 * is optional; we emit a payload either way so the wizard moves forward.
 *
 * Logo upload is staged client-side here — the actual upload to
 * Supabase Storage is best handled by an existing pattern in the
 * codebase (see `src/components/admin/...`); for the initial onboarding
 * flow we accept a file and pass it back to the wizard which persists
 * the metadata only. A follow-up brief can wire the storage upload.
 */

export interface Step1BrandingProps {
    orgSlug: string
    storeName: string
    onComplete: (payload: { logoFileName?: string }) => void
}

export function Step1Branding({ orgSlug, storeName, onComplete }: Step1BrandingProps) {
    const fileRef = useRef<HTMLInputElement>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [fileName, setFileName] = useState<string | null>(null)

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setFileName(file.name)
        const reader = new FileReader()
        reader.onload = (ev) => setPreview((ev.target?.result as string) ?? null)
        reader.readAsDataURL(file)
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Confirm your studio identity. You can change these later in Settings.
            </p>

            <div className="space-y-1">
                <Label>Studio name</Label>
                <div className="text-base font-medium">{storeName}</div>
            </div>

            <div className="space-y-1">
                <Label>Workspace URL</Label>
                <div className="text-sm text-muted-foreground">
                    lende.shipbyx.com/<strong className="text-foreground">{orgSlug}</strong>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="logo">Logo (optional)</Label>
                <div className="flex items-center gap-3">
                    {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={preview}
                            alt="Logo preview"
                            className="h-12 w-12 rounded-lg object-cover border border-border"
                        />
                    ) : (
                        <div className="h-12 w-12 rounded-lg bg-slate-100 border border-border flex items-center justify-center text-xs text-muted-foreground">
                            No logo
                        </div>
                    )}
                    <div className="flex-1">
                        <input
                            ref={fileRef}
                            id="logo"
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            onChange={handleFile}
                            className="text-xs"
                        />
                        {fileName && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Selected: {fileName} (uploaded after onboarding)
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="pt-2">
                <Button
                    type="button"
                    onClick={() => onComplete({ logoFileName: fileName ?? undefined })}
                    className="w-full"
                >
                    Continue
                </Button>
            </div>
        </div>
    )
}
