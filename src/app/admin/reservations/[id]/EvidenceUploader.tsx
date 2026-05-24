'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveEvidence } from '../../actions'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
// Icons
const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
)

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
)

interface EvidenceUploaderProps {
    reservationId: string
    type: 'dispatch' | 'return'
    existingImages?: string[] | null
    notes?: string | null
    readOnly?: boolean
}

export default function EvidenceUploader({
    reservationId,
    type,
    existingImages = [],
    notes = '',
    readOnly = false
}: EvidenceUploaderProps) {
    const [uploading, setUploading] = useState(false)
    const [images, setImages] = useState<string[]>(existingImages || [])
    const [noteText, setNoteText] = useState(notes || '')
    const [isSaved, setIsSaved] = useState(false)
    const [isSaving, startSaveTransition] = useTransition()
    const router = useRouter()
    const supabase = createClient()

    const title = type === 'dispatch' ? 'Dispatch Evidence (Before Request)' : 'Return Evidence (After Return)'
    const description = type === 'dispatch'
        ? 'Upload photos of item condition BEFORE sending to customer.'
        : 'Upload photos of item condition AFTER receiving from customer.'

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return
        setUploading(true)
        setIsSaved(false)

        const newPaths: string[] = []

        try {
            for (const file of Array.from(e.target.files)) {
                const ext = file.name.split('.').pop()
                const fileName = `${reservationId}/${type}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`

                const { error } = await supabase.storage
                    .from('evidence')
                    .upload(fileName, file)

                if (error) {
                    console.error('Upload failed:', error)
                    toast.error('Upload failed: ' + error.message)
                } else {
                    // Get public URL or just store path. 
                    // Storing partial path allows later flexibility, but full URL is easier for display if bucket is public.
                    // Let's store the storage path (key).
                    newPaths.push(fileName)
                }
            }

            setImages(prev => [...prev, ...newPaths])
        } catch (err) {
            console.error('Error:', err)
        } finally {
            setUploading(false)
        }
    }

    const handleSave = async () => {
        startSaveTransition(() => {
            void (async () => {
                const res = await saveEvidence(reservationId, type, images, noteText)
                if (res.success) {
                    setIsSaved(true)
                    toast.success('Evidence saved')
                    router.refresh()
                    setTimeout(() => setIsSaved(false), 3000)
                } else {
                    toast.error(res.error || 'Failed to save evidence')
                }
            })()
        })
    }

    const getImageUrl = (path: string) => {
        try {
            const resolved = path.startsWith('http')
                ? new URL(path)
                : new URL(supabase.storage.from('evidence').getPublicUrl(path).data.publicUrl)

            if (!['http:', 'https:'].includes(resolved.protocol)) {
                return ''
            }

            return resolved.href
        } catch {
            return ''
        }
    }

    return (
        <div className={`border rounded-xl p-6 bg-card ${type === 'return' ? 'border-orange-100 bg-orange-50/30' : 'border-blue-100 bg-blue-50/30'}`}>
            <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground mb-4">{description}</p>

            {/* Gallery */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {images.map((path, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-muted border">
                        {getImageUrl(path) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={getImageUrl(path)}
                                alt="Evidence"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs">
                                Invalid image URL
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Upload & Notes */}
            {!readOnly && (
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <label className="cursor-pointer bg-card border border-input rounded-md px-4 py-2 hover:bg-muted/50 transition-colors flex items-center gap-2 text-sm font-medium text-foreground shadow-sm">
                            <UploadIcon />
                            <span>Add Photos</span>
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                                disabled={uploading}
                            />
                        </label>
                        {uploading && <span className="text-sm text-muted-foreground/70">Uploading...</span>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                        <textarea
                            className="w-full rounded-md border-input shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                            rows={3}
                            placeholder="Describe any pre-existing damage or condition..."
                            value={noteText}
                            onChange={(e) => {
                                setNoteText(e.target.value)
                                setIsSaved(false)
                            }}
                        />
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={uploading || isSaving}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-white font-medium transition-colors ${isSaved
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-primary hover:bg-primary'
                                }`}
                        >
                            {isSaved ? (
                                <>
                                    <CheckIcon />
                                    Saved
                                </>
                            ) : (
                                'Save Evidence'
                            )}
                        </button>
                    </div>
                </div>
            )}

            {readOnly && notes && (
                <div className="mt-4 p-3 bg-muted/50 rounded text-sm text-foreground">
                    <span className="font-semibold block text-xs text-muted-foreground/70 uppercase tracking-wider mb-1">Notes</span>
                    <p className="whitespace-pre-wrap break-words">{notes}</p>
                </div>
            )}
        </div>
    )
}
