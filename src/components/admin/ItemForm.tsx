'use client'

import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, X, Plus, CheckCircle2, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { createItem, updateItem, uploadItemImage, createCategory, createCollection } from '@/actions/items'
import type { Item, ItemSpecs, ITEM_STATUS_OPTIONS } from '@/types'
import { OFFICIAL_CHARACTERS, OFFICIAL_SIDE_CHARACTERS } from '@/lib/items/catalog-rules'
import { toast } from 'sonner'

const itemSchema = z.object({
    sku: z.string().min(1, 'SKU is required'),
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    line_type: z.enum(['Mainline', 'Collaboration', 'Archive']),
    character_family: z.string().trim().min(1, 'Character is required'),
    side_character: z.string().trim().optional(),
    category_id: z.string().optional(),
    collection_id: z.string().optional(),
    material: z.string().optional(),
    weight: z.string().optional(),
    color: z.string().optional(),
    category: z.string().optional(), // Legacy, sync from category_id
    rental_price: z.coerce.number().min(0, 'Price must be positive').optional(),
    replacement_cost: z.coerce.number().gt(0, 'RRP must be greater than 0'),
    status: z.enum(['active', 'maintenance', 'retired']),
})

export type ItemFormData = z.infer<typeof itemSchema>

interface Category {
    id: string
    name: string
}

interface Collection {
    id: string
    name: string
}

interface ItemFormProps {
    item?: Item
    mode: 'create' | 'edit'
    categories: Category[]
    collections: Collection[]
    isStaging?: boolean
    onSubmitOverride?: (data: ItemFormData & { image_paths: string[] }) => Promise<{ success: boolean; error?: string }>
    initialData?: Partial<ItemFormData> & { image_paths?: string[] }
    onCancel?: () => void
    basePath?: string
}

const STATUS_OPTIONS: typeof ITEM_STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'retired', label: 'Retired' },
]

const ONE_WEEK_RENTAL_RATE = 0.15
const ONE_WEEK_DAYS = 7

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const deriveDailyRentalFromRrp = (rrp: number) => {
    const safeRrp = Number.isFinite(rrp) ? Math.max(0, rrp) : 0
    return roundCurrency((safeRrp * ONE_WEEK_RENTAL_RATE) / ONE_WEEK_DAYS)
}

const RING_SIZE_GUIDE_TEXT = 'Ring size guide: S diameter 16.9mm (circumference 51.8mm), M diameter 18.2mm (circumference 57.2mm).'

const normalizeTemplateKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

const SIZE_TEMPLATE_BY_NAME: Record<string, string> = {
    [normalizeTemplateKey('ORCHID WHISPER EARRINGS')]: 'S / M / L\nL: 8.8cm * 8cm\nM: 6.5cm * 5.5cm\nS: 3.5cm * 3cm',
    [normalizeTemplateKey('HAPPY ORCHIDS EARRINGS')]: 'OS\nOS: 7.8cm * 8cm',
    [normalizeTemplateKey('DASHA REBIRTH EARRINGS')]: 'OS',
    [normalizeTemplateKey("BOTANIC ELEGY: THE BLOSSOM'S AFTERLIFE")]: 'OS\nOS: 8.2cm * 8cm',
    [normalizeTemplateKey('OCEANSPINE PETALS')]: 'OS\nOS: 12cm * 2.1cm',
    [normalizeTemplateKey('OCEANSPINE CORAL EARRINGS')]: 'OS',
    [normalizeTemplateKey('SEA PASSIFLORA')]: 'OS\nOS: 9.5cm * 8.5cm',
    [normalizeTemplateKey('BROOCH')]: 'S / M\nS: 8.8cm * 8cm\nM: 7cm * 7.5cm',
}

export const ItemForm = ({
    item,
    mode,
    categories: initialCategories,
    collections: initialCollections,
    isStaging = false,
    onSubmitOverride,
    initialData,
    onCancel,
    basePath = '/admin',
}: ItemFormProps) => {
    const router = useRouter()
    const [isSubmitting, startSubmitting] = useTransition()
    const [images, setImages] = useState<string[]>(initialData?.image_paths ?? item?.image_paths ?? [])
    const [specs, setSpecs] = useState<ItemSpecs>(
        (item?.specs as ItemSpecs) ?? {}
    )
    const [uploadingImage, setUploadingImage] = useState(false)
    const [isCloneAfterSave, setIsCloneAfterSave] = useState(false)

    // Workflow state
    const [isAddingVariation, setIsAddingVariation] = useState(false)
    const [lastSavedItemName, setLastSavedItemName] = useState<string | null>(null)

    // Local state for categories/collections to support immediate UI updates after quick add
    const [categories, setCategories] = useState(initialCategories)
    const [collections, setCollections] = useState(initialCollections)
    const initialCharacterFamily = initialData?.character_family ?? item?.character_family ?? ''
    const defaultCharacterFamily = OFFICIAL_CHARACTERS.includes(initialCharacterFamily as typeof OFFICIAL_CHARACTERS[number])
        ? initialCharacterFamily
        : ''

    const {
        register,
        handleSubmit,
        formState: { errors },
        setValue,
        watch,
    } = useForm<ItemFormData>({
        resolver: zodResolver(itemSchema) as Resolver<ItemFormData>,
        defaultValues: {
            sku: initialData?.sku ?? item?.sku ?? '',
            name: initialData?.name ?? item?.name ?? '',
            description: initialData?.description ?? item?.description ?? '',
            line_type: initialData?.line_type ?? item?.line_type ?? 'Mainline',
            character_family: defaultCharacterFamily,
            side_character: initialData?.side_character ?? item?.side_character ?? '',
            category_id: initialData?.category_id ?? item?.category_id ?? '',
            collection_id: initialData?.collection_id ?? item?.collection_id ?? '',
            material: initialData?.material ?? item?.material ?? '',
            weight: initialData?.weight ?? item?.weight ?? '',
            color: initialData?.color ?? item?.color ?? '',
            category: initialData?.category ?? item?.category ?? '',
            rental_price: initialData?.rental_price ?? item?.rental_price ?? 0,
            replacement_cost: initialData?.replacement_cost ?? item?.replacement_cost ?? 0,
            status: (initialData?.status as ItemFormData['status']) ?? item?.status ?? 'active',
        },
    })

    // Watch category_id to sync category name
    const selectedCategoryId = watch('category_id')

    // Sync category name when ID changes
    if (selectedCategoryId) {
        const cat = categories.find(c => c.id === selectedCategoryId)
        if (cat && watch('category') !== cat.name) {
            setValue('category', cat.name)
        }
    }

    const selectedCategoryName = categories.find((c) => c.id === watch('category_id'))?.name ?? ''
    const normalizedCategoryName = selectedCategoryName.toLowerCase().replace(/\s+/g, '')
    const singularCategoryName = normalizedCategoryName.endsWith('s')
        ? normalizedCategoryName.slice(0, -1)
        : normalizedCategoryName
    const isRingCategory = singularCategoryName === 'ring'
    const isEarringCategory = singularCategoryName === 'earring'

    const handleQuickAddCategory = async () => {
        const name = prompt("Enter new jewelry type name:")
        if (!name) return

        const result = await createCategory(name)
        if (result.success && result.data) {
            setCategories([...categories, result.data])
            setValue('category_id', result.data.id)
            toast.success(`Jewelry type "${name}" created`)
        } else {
            toast.error("Failed to create jewelry type")
        }
    }

    const handleQuickAddCollection = async () => {
        const name = prompt("Enter new website collection name:")
        if (!name) return

        const result = await createCollection(name)
        if (result.success && result.data) {
            setCollections([...collections, result.data])
            setValue('collection_id', result.data.id)
            toast.success(`Website collection "${name}" created`)
        } else {
            toast.error("Failed to create website collection")
        }
    }

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploadingImage(true)
        try {
            const formData = new FormData()
            formData.append('file', file)

            const result = await uploadItemImage(formData)
            if (result.success && result.url) {
                setImages([...images, result.url])
                toast.success('Image uploaded')
            } else {
                console.error('Upload failed:', result.error)
                toast.error(result.error || 'Failed to upload image')
            }
        } catch (error) {
            console.error('Upload error:', error)
            toast.error('Failed to upload image')
        } finally {
            setUploadingImage(false)
        }
    }

    const removeImage = (index: number) => {
        setImages(images.filter((_, i) => i !== index))
    }

    const addSpec = () => {
        const key = prompt('Enter spec name (e.g., size, karat):')
        if (key && key.trim()) {
            setSpecs({ ...specs, [key.trim()]: '' })
        }
    }

    const updateSpec = (key: string, value: string) => {
        setSpecs({ ...specs, [key]: value })
    }

    const removeSpec = (key: string) => {
        const newSpecs = { ...specs }
        delete newSpecs[key]
        setSpecs(newSpecs)
    }

    const onSubmit = async (data: ItemFormData) => {
        startSubmitting(() => {
            void (async () => {
                try {
                    const derivedRentalPrice = deriveDailyRentalFromRrp(data.replacement_cost)
                    const itemData = {
                        ...data,
                        rental_price: derivedRentalPrice,
                        image_paths: images,
                        specs,
                        description: data.description || undefined,
                        character_family: data.character_family.trim(),
                        side_character: data.side_character?.trim() || undefined,
                        category_id: data.category_id || undefined,
                        collection_id: data.collection_id || undefined,
                        material: data.material || undefined,
                        weight: data.weight || undefined,
                        color: data.color || undefined,
                        // Ensure category string is synced if category_id represents a known category
                        category: data.category || (data.category_id ? categories.find(c => c.id === data.category_id)?.name : undefined)
                    }

                    if (isStaging && onSubmitOverride) {
                        const result = await onSubmitOverride({
                            ...itemData,
                            category_id: data.category_id, // Ensure optional fields are passed
                            collection_id: data.collection_id,
                            image_paths: images
                        })

                        if (result.success) {
                            toast.success("Item updated in staging")
                        } else {
                            toast.error(result.error || "Failed to update item")
                        }
                        return
                    }

                    let result

                    // Determine operation:
                    // 1. Create Mode: Always create
                    // 2. Edit Mode + isAddingVariation (Clone loop): Always create new item
                    // 3. Edit Mode (Initial Save): Update existing
                    const shouldCreateNew = mode === 'create' || isAddingVariation

                    // Special case for "Save & Add Variation" from Edit Mode:
                    // If we are editing (not yet in loop) and click "Save & Add", we usually want to UPDATE the current item first, 
                    // then switch to creating new ones. 
                    // BUT, if the user requested "Clone", previously we forced Create. 
                    // The standard behavior for "Save & Add" on Edit Page is: Save changes to THIS item, then start NEW One.

                    if (shouldCreateNew) {
                        result = await createItem(itemData)
                    } else {
                        // We are in Edit Mode and NOT in the variation loop yet.
                        // Even if isCloneAfterSave is true, we update the current item first.
                        result = await updateItem(item!.id, itemData)
                    }

                    if (result.success) {
                        if (isCloneAfterSave) {
                            // Clone Mode: Prepare form for the next variation

                            // Logic: Keep existing images (user request), but prompt.
                            // Keep everything else.
                            // Reset SKU to avoid conflict.

                            setValue('sku', `${data.sku}-VAR`)
                            setValue('color', '') // Reset Color
                            setImages([]) // User requested to CLEAR images for new color

                            setIsCloneAfterSave(false)
                            setIsAddingVariation(true)
                            setLastSavedItemName(itemData.name)

                            toast.success("Item saved successfully", {
                                description: "Design saved. Now adding a new variation..."
                            })

                            // Scroll to top to show banner
                            window.scrollTo({ top: 0, behavior: 'smooth' })

                        } else {
                            toast.success("Item saved successfully")
                            router.push(`${basePath}/items`)
                            router.refresh()
                        }
                    } else {
                        console.error('Save failed:', result.error)
                        toast.error(`Failed to save item: ${result.error}`)
                    }
                } catch (error) {
                    console.error('Submit error:', error)
                    toast.error("An unexpected error occurred")
                }
            })()
        })
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {isAddingVariation && lastSavedItemName && (
                <Alert className="border-green-500 bg-green-50 text-green-900">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle>Success!</AlertTitle>
                    <AlertDescription>
                        Design &quot;{lastSavedItemName}&quot; saved. Now adding a new variation...
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Basic Info */}
                <Card>
                    <CardHeader>
                        <CardTitle>Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="sku">Style *</Label>
                            <Input
                                id="sku"
                                {...register('sku')}
                                placeholder="e.g., RB-ORD-WH001-S"
                            />
                            {errors.sku && (
                                <p className="text-sm text-red-500">{errors.sku.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="material">Material</Label>
                            <Input
                                id="material"
                                {...register('material')}
                                placeholder="e.g., Customised Resin"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="color">Colour</Label>
                            <Input
                                id="color"
                                {...register('color')}
                                placeholder="e.g., White"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                {...register('description')}
                                placeholder="Describe the item..."
                                rows={3}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="category_id">Jewelry Type</Label>
                                <div className="flex gap-2">
                                    <Select
                                        value={watch('category_id') || "none"}
                                        onValueChange={(value) => setValue('category_id', value === "none" ? "" : value)}
                                    >
                                        <SelectTrigger className="flex-1">
                                            <SelectValue placeholder="Select Jewelry Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {categories.map((c) => (
                                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button type="button" variant="outline" size="icon" onClick={handleQuickAddCategory} title="Quick Add Jewelry Type">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="size">Sizes</Label>
                                <Input
                                    id="size"
                                    value={specs.size ?? ''}
                                    onChange={(e) => updateSpec('size', e.target.value)}
                                    placeholder="e.g., Mini / Regular / OS"
                                />
                                <div className="flex flex-wrap gap-2">
                                    {isRingCategory ? (
                                        <>
                                            <Button type="button" variant="outline" size="sm" onClick={() => updateSpec('size', 'S')}>
                                                S
                                            </Button>
                                            <Button type="button" variant="outline" size="sm" onClick={() => updateSpec('size', 'M')}>
                                                M
                                            </Button>
                                        </>
                                    ) : isEarringCategory ? (
                                        <>
                                            <Button type="button" variant="outline" size="sm" onClick={() => updateSpec('size', 'Mini')}>
                                                Mini
                                            </Button>
                                            <Button type="button" variant="outline" size="sm" onClick={() => updateSpec('size', 'Regular')}>
                                                Regular
                                            </Button>
                                            <Button type="button" variant="outline" size="sm" onClick={() => updateSpec('size', 'OS')}>
                                                OS
                                            </Button>
                                        </>
                                    ) : null}
                                </div>
                                {isRingCategory && (
                                    <p className="text-xs text-muted-foreground">{RING_SIZE_GUIDE_TEXT}</p>
                                )}
                                {SIZE_TEMPLATE_BY_NAME[normalizeTemplateKey(watch('name') || '')] && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => updateSpec('size', SIZE_TEMPLATE_BY_NAME[normalizeTemplateKey(watch('name') || '')])}
                                    >
                                        Apply Recommended Size Template
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="name">Accessories *</Label>
                            <Input
                                id="name"
                                {...register('name')}
                                placeholder="e.g., Orchid Whisper Earrings"
                            />
                            {errors.name && (
                                <p className="text-sm text-red-500">{errors.name.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="weight">Weight</Label>
                            <Input
                                id="weight"
                                {...register('weight')}
                                placeholder="e.g., 1g/each"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="replacement_cost">RRP *</Label>
                            <Input
                                id="replacement_cost"
                                type="number"
                                step="0.01"
                                {...register('replacement_cost')}
                                placeholder="0.00"
                            />
                            {errors.replacement_cost && (
                                <p className="text-sm text-red-500">
                                    {errors.replacement_cost.message}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Recommended retail price (used for invoice rental tier and deposit).
                            </p>
                        </div>

                        <div className="border-t pt-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Secondary Information
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="line_type">Line Type *</Label>
                                <Select
                                    value={watch('line_type')}
                                    onValueChange={(value) => setValue('line_type', value as ItemFormData['line_type'])}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select line type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Mainline">Mainline</SelectItem>
                                        <SelectItem value="Collaboration">Collaboration</SelectItem>
                                        <SelectItem value="Archive">Archive</SelectItem>
                                    </SelectContent>
                                </Select>
                                {errors.line_type && (
                                    <p className="text-sm text-red-500">{errors.line_type.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="character_family">Character *</Label>
                                <Select
                                    value={OFFICIAL_CHARACTERS.includes(watch('character_family') as typeof OFFICIAL_CHARACTERS[number]) ? watch('character_family') : 'none'}
                                    onValueChange={(value) => setValue('character_family', value === 'none' ? '' : value)}
                                >
                                    <SelectTrigger id="character_family">
                                        <SelectValue placeholder="Choose Character" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Choose Character</SelectItem>
                                        {OFFICIAL_CHARACTERS.map((character) => (
                                            <SelectItem key={character} value={character}>
                                                {character}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {errors.character_family && (
                                    <p className="text-sm text-red-500">{errors.character_family.message}</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="side_character">Side Character</Label>
                            <Input
                                id="side_character"
                                {...register('side_character')}
                                placeholder="e.g., Stud Earrings / Dangle Earrings / Mega Earrings"
                                list="side-character-options"
                            />
                            <datalist id="side-character-options">
                                {OFFICIAL_SIDE_CHARACTERS.map((option) => (
                                    <option key={option} value={option} />
                                ))}
                            </datalist>
                            <div className="flex flex-wrap gap-2">
                                {OFFICIAL_SIDE_CHARACTERS.slice(0, 6).map((option) => (
                                    <Button
                                        key={option}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setValue('side_character', option)}
                                    >
                                        {option}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Keep Character short (e.g., Daffodils Blossom) and use Side Character for sub-series.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="collection_id">Website Collection</Label>
                            <div className="flex gap-2">
                                <Select
                                    value={watch('collection_id') || "none"}
                                    onValueChange={(value) => setValue('collection_id', value === "none" ? "" : value)}
                                >
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Select Website Collection" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {collections.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="outline" size="icon" onClick={handleQuickAddCollection} title="Quick Add Website Collection">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select
                                value={watch('status')}
                                onValueChange={(value) =>
                                    setValue('status', value as ItemFormData['status'])
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {STATUS_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Images */}
                <Card>
                    <CardHeader>
                        <CardTitle>Images</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            {images.map((url, index) => (
                                <div key={index} className="relative">
                                    <Image
                                        src={url}
                                        alt={`Item image ${index + 1}`}
                                        width={100}
                                        height={100}
                                        className="h-24 w-24 rounded-lg object-cover"
                                        unoptimized
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeImage(index)}
                                        className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            {/* Only allow uploads if not in staging mode (or implement staging uploads later) */}
                            {/* Staging usually has external URLs, but we could allow uploads if needed. keeping enabled for now. */}
                            <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-input hover:border-muted-foreground">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                    disabled={uploadingImage}
                                />
                                {uploadingImage ? (
                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                ) : (
                                    <Upload className="h-6 w-6 text-muted-foreground/70" />
                                )}
                            </label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Upload images to Supabase Storage
                        </p>
                    </CardContent>
                </Card>

                {/* Specs - Hidden in Staging Mode as staging_items tokens usually don't support custom specs yet */}
                {!isStaging && (
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Specifications</CardTitle>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addSpec}
                            >
                                <Plus className="mr-1 h-4 w-4" />
                                Add Spec
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {Object.entries(specs).map(([key, value]) => (
                                <div key={key} className="flex items-center gap-2">
                                    <Label className="w-24 shrink-0 text-sm capitalize">
                                        {key}
                                    </Label>
                                    <Input
                                        value={value ?? ''}
                                        onChange={(e) => updateSpec(key, e.target.value)}
                                        placeholder={`Enter ${key}...`}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeSpec(key)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            {Object.keys(specs).length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    No specifications added yet. Click &quot;Add Spec&quot; to add size, carat, etc.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-4">
                <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => {
                        if (onCancel) {
                            onCancel()
                            return
                        }

                        if (isAddingVariation) {
                            // Confirm before leaving if variants were added
                            if (confirm("Your previously saved variants are safe. Do you want to stop adding more?")) {
                                router.push(`${basePath}/items`)
                            }
                        } else {
                            if (isStaging && onSubmitOverride) {
                                // In staging mode the parent dialog handles dismissal via onCancel.
                            } else {
                                router.push(`${basePath}/items`)
                            }
                        }
                    }}
                >
                    Cancel
                </Button>

                {/* Save and Add Variation Button - Hidden in Staging */}
                {!isStaging && (
                    <Button
                        type="submit"
                        variant="secondary"
                        disabled={isSubmitting}
                        onClick={() => setIsCloneAfterSave(true)}
                        className="gap-2"
                        title="Save current item and clone it as a new variation"
                    >
                        {isSubmitting && isCloneAfterSave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {isSubmitting && isCloneAfterSave ? 'Processing...' : (isAddingVariation ? 'Save & Add Another Color' : 'Save & Add Variation')}
                    </Button>
                )}

                <Button type="submit" disabled={isSubmitting} onClick={() => setIsCloneAfterSave(false)}>
                    {isSubmitting && !isCloneAfterSave && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isSubmitting && !isCloneAfterSave
                        ? 'Processing...'
                        : isStaging
                            ? 'Save Changes'
                            : (isAddingVariation || mode === 'create')
                                ? (isAddingVariation ? 'Save & Finish' : 'Create Product')
                                : 'Update Item'}
                </Button>
            </div>
        </form>
    )
}
