import type { MetadataRoute } from "next"

/**
 * M-04: Marketing sitemap for SEO crawlers. Covers all 14 public marketing
 * pages. Admin / authenticated routes are excluded by virtue of not being
 * listed here (and via robots.ts disallow on /admin etc.).
 *
 * URL base: https://lende.shipbyx.com
 */
const BASE_URL = "https://lende.shipbyx.com"

const marketingRoutes: { path: string; priority: number; changefreq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1.0, changefreq: "weekly" },
  { path: "/features", priority: 0.9, changefreq: "monthly" },
  { path: "/pricing", priority: 0.9, changefreq: "monthly" },
  { path: "/demo", priority: 0.7, changefreq: "monthly" },
  { path: "/smart-import", priority: 0.5, changefreq: "monthly" },
  { path: "/about", priority: 0.7, changefreq: "monthly" },
  { path: "/case-study", priority: 0.7, changefreq: "monthly" },
  { path: "/contact", priority: 0.6, changefreq: "monthly" },
  { path: "/docs", priority: 0.5, changefreq: "weekly" },
  { path: "/changelog", priority: 0.5, changefreq: "weekly" },
  { path: "/roadmap", priority: 0.5, changefreq: "monthly" },
  { path: "/login", priority: 0.4, changefreq: "yearly" },
  { path: "/signup", priority: 0.6, changefreq: "yearly" },
  { path: "/legal/privacy", priority: 0.3, changefreq: "yearly" },
  { path: "/legal/terms", priority: 0.3, changefreq: "yearly" },
  { path: "/legal/dpa", priority: 0.3, changefreq: "yearly" },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return marketingRoutes.map(({ path, priority, changefreq }) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency: changefreq,
    priority,
  }))
}
