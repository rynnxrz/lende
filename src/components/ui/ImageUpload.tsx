'use client'

import { toast } from 'sonner'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { v4 as uuidv4 } from 'uuid'

interface ImageUploadProps {
    onUpload: (url: string) => void
    bucket?: string
    folder?: string
}

export default function ImageUpload({ onUpload, bucket = 'rental_items', folder = 'items' }: ImageUploadProps) {
    const [uploading, setUploading] = useState(false)
    const [preview, setPreview] = useState<string | null>(null)
    const supabase = createClient()

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setUploading(true)

            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select an image to upload.')
            }

            const file = event.target.files[0]
            if (!file.type.startsWith('image/')) {
                throw new Error('Please upload an image file.')
            }
            const fileExt = file.name.split('.').pop()
            const fileName = `${folder}/${uuidv4()}.${fileExt}`
            const filePath = `${fileName}`

            // Create preview
            const objectUrl = URL.createObjectURL(file)
            setPreview(objectUrl)

            const { error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(filePath, file)

            if (uploadError) {
                throw uploadError
            }

            const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)

            onUpload(data.publicUrl)

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            toast.error('Error uploading image: ' + message)
            setPreview(null)
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">
                Item Image
            </label>

            <div className="flex items-center justify-center w-full">
                {preview ? (
                    <div className="relative w-full h-64 rounded-lg overflow-hidden border-2 border-gray-300">
                        <img
                            src={preview}
                            alt="Upload preview"
                            className="w-full h-full object-cover"
                        />
                        <button
                            onClick={(e) => {
                                e.preventDefault()
                                setPreview(null)
                            }}
                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                            </svg>
                            <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-gray-500">SVG, PNG, JPG or GIF (MAX. 800x400px)</p>
                        </div>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handleUpload}
                            disabled={uploading}
                        />
                    </label>
                )}
            </div>
            {uploading && <p className="mt-2 text-sm text-blue-600">Uploading...</p>}
        </div>
    )
}
