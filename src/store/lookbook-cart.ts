import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface LookbookCartItem {
    id: string
    inventoryItemId: string
    name: string
    sku: string | null
    rentalPrice: number | null
    image: string | null
}

export interface LookbookCartState {
    items: LookbookCartItem[]
    dateRange: { from: string | null; to: string | null }
    contactInfo: { email: string; name: string; notes: string }
    updatedAt: number

    addItem: (item: LookbookCartItem) => void
    removeItem: (id: string) => void
    hasItem: (id: string) => boolean
    setDateRange: (range: { from: string | null; to: string | null }) => void
    setContactInfo: (info: Partial<LookbookCartState['contactInfo']>) => void
    clear: () => void
    checkExpiry: () => void
}

const INITIAL_CONTACT = { email: '', name: '', notes: '' }

export const useLookbookCart = create<LookbookCartState>()(
    persist(
        (set, get) => ({
            items: [],
            dateRange: { from: null, to: null },
            contactInfo: { ...INITIAL_CONTACT },
            updatedAt: Date.now(),

            addItem: (item) => {
                const { items } = get()
                if (items.some((i) => i.id === item.id)) return
                set({ items: [...items, item], updatedAt: Date.now() })
            },

            removeItem: (id) =>
                set((s) => ({
                    items: s.items.filter((i) => i.id !== id),
                    updatedAt: Date.now(),
                })),

            hasItem: (id) => get().items.some((i) => i.id === id),

            setDateRange: (range) => set({ dateRange: range, updatedAt: Date.now() }),

            setContactInfo: (info) =>
                set((s) => ({
                    contactInfo: { ...s.contactInfo, ...info },
                    updatedAt: Date.now(),
                })),

            clear: () =>
                set({
                    items: [],
                    dateRange: { from: null, to: null },
                    contactInfo: { ...INITIAL_CONTACT },
                    updatedAt: Date.now(),
                }),

            checkExpiry: () => {
                const oneDay = 24 * 60 * 60 * 1000
                if (Date.now() - get().updatedAt > oneDay) get().clear()
            },
        }),
        {
            name: 'lookbook-cart',
            storage: createJSONStorage(() => localStorage),
            onRehydrateStorage: () => (state) => state?.checkExpiry(),
        },
    ),
)
