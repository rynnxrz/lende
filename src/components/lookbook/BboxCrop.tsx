import { cn } from '@/lib/utils'

type Bbox = { x: number; y: number; w: number; h: number }

interface BboxCropProps {
    pageImageUrl: string
    bbox: Bbox
    className?: string
    alt?: string
    loading?: 'eager' | 'lazy'
}

const MIN_BBOX_DIMENSION = 0.05

export function BboxCrop({
    pageImageUrl,
    bbox,
    className,
    alt = '',
    loading = 'lazy',
}: BboxCropProps) {
    const w = Math.max(MIN_BBOX_DIMENSION, Math.min(1, bbox.w))
    const h = Math.max(MIN_BBOX_DIMENSION, Math.min(1, bbox.h))
    const x = Math.max(0, Math.min(1 - w, bbox.x))
    const y = Math.max(0, Math.min(1 - h, bbox.y))

    return (
        <div className={cn('relative overflow-hidden bg-muted', className)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={pageImageUrl}
                alt={alt}
                loading={loading}
                style={{
                    position: 'absolute',
                    width: `${100 / w}%`,
                    height: `${100 / h}%`,
                    left: `${-(x / w) * 100}%`,
                    top: `${-(y / h) * 100}%`,
                    maxWidth: 'none',
                }}
            />
        </div>
    )
}
