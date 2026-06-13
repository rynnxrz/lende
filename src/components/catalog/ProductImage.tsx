import { ImageOff } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ProductImageProps {
    /** Image source URL. When empty, a neutral placeholder is shown. */
    src: string | null | undefined
    alt: string
    /** Classes for the outer box — caller owns aspect ratio, size, padding, bg, rounding. */
    className?: string
    /** Extra classes for the <img> itself (e.g. hover scale / transitions). */
    imgClassName?: string
    /** Eager-load above-the-fold images. */
    priority?: boolean
}

/**
 * Product photo that never upscales past its native resolution.
 *
 * Catalog photos vary wildly in size; the old `next/image fill` + `object-contain`
 * stretched small/low-res files up to fill the box, which looked blurry. Here the
 * <img> is sized with `max-w/h-full` + `w/h-auto`, so the browser renders it at
 * `min(natural, box)`: small images stay crisp at native size (centered, with
 * honest whitespace), large images still contain down to fit. No stored
 * dimensions or JS required.
 */
export function ProductImage({
    src,
    alt,
    className,
    imgClassName,
    priority = false,
}: ProductImageProps) {
    return (
        <div className={cn('relative flex items-center justify-center overflow-hidden', className)}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={alt}
                    decoding="async"
                    loading={priority ? 'eager' : 'lazy'}
                    fetchPriority={priority ? 'high' : undefined}
                    className={cn('h-auto w-auto max-h-full max-w-full object-contain', imgClassName)}
                />
            ) : (
                <ImageOff className="h-8 w-8 text-slate-300" aria-hidden="true" />
            )}
        </div>
    )
}
