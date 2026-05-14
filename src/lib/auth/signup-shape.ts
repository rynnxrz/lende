export type SignupShapeValidation =
    | { ok: true }
    | { ok: false; error: string; field: 'email' | 'password' | 'storeName' | 'slug' }

const RESERVED_SLUGS = new Set([
    'admin', 'api', 'app', 'auth', 'billing', 'dashboard', 'docs',
    'help', 'login', 'logout', 'pricing', 'privacy', 'public',
    'select-workspace', 'settings', 'signup', 'static', 'support',
    'terms', 'www',
])

export function validateSignupShape(input: {
    email: string
    storeName: string
    slug: string
    password?: string
    requirePassword?: boolean
}): SignupShapeValidation {
    const email = input.email.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: 'Please enter a valid email address.', field: 'email' }
    }
    if (input.requirePassword) {
        if (!input.password || input.password.length < 8) {
            return {
                ok: false,
                error: 'Password must be at least 8 characters.',
                field: 'password',
            }
        }
    }
    if (!input.storeName || input.storeName.trim().length < 2) {
        return {
            ok: false,
            error: 'Studio name must be at least 2 characters.',
            field: 'storeName',
        }
    }
    const slug = input.slug.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || slug.length < 3 || slug.length > 32) {
        return {
            ok: false,
            error:
                'URL slug must be 3-32 characters, lowercase letters/numbers/dashes, and start/end with a letter or number.',
            field: 'slug',
        }
    }
    if (RESERVED_SLUGS.has(slug)) {
        return {
            ok: false,
            error: `"${slug}" is reserved. Please pick a different workspace URL.`,
            field: 'slug',
        }
    }
    return { ok: true }
}
