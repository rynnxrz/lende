import type { MetadataRoute } from "next"

/**
 * M-04: robots.txt for crawlers. Allows public marketing pages, blocks
 * admin / API / authenticated tenant routes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/*",
          "/system-admin",
          "/system-admin/*",
          "/api",
          "/api/*",
          "/auth",
          "/auth/*",
          "/invite",
          "/invite/*",
          "/wholesale",
          "/wholesale/*",
          "/payment-confirmation",
          "/payment-confirmation/*",
          "/catalog",
          "/catalog/*",
          "/legacy",
          "/legacy/*",
        ],
      },
    ],
    sitemap: "https://lende.shipbyx.com/sitemap.xml",
  }
}
