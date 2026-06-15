import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        // Current (multi-tenant SaaS) Supabase project — where live item
        // images are stored. Matches NEXT_PUBLIC_SUPABASE_URL.
        hostname: 'zigyiqqboiadinelfzxw.supabase.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        // Legacy single-tenant project — kept so any not-yet-migrated
        // image URLs still resolve.
        hostname: 'bfizqdyngujjdmaaoggg.supabase.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'ivyjstudio.com',
        pathname: '/cdn/shop/files/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', '@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-slot', '@radix-ui/react-label'],
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production'
    const devConnectSrc = isDev ? ' http://127.0.0.1:* http://localhost:*' : ''
    return [
      {
        source: '/:path*',
        headers: [
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Control referrer information
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Enforce HTTPS for 1 year
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.clarity.ms https://*.sentry-cdn.com https://va.vercel-scripts.com",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https://*.supabase.co https://placehold.co https://ivyjstudio.com https://cdn.shopify.com data: blob:",
              "font-src 'self' data:",
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.clarity.ms https://*.sentry.io https://*.ingest.sentry.io https://vitals.vercel-insights.com https://va.vercel-scripts.com${devConnectSrc}`,
              "frame-ancestors 'self' http://localhost:5173 https://shipbyx.com https://www.shipbyx.com",
            ].join('; ')
          },
        ],
      },
    ]
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
});
