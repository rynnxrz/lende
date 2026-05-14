import type { Metadata } from "next";
import NextTopLoader from 'nextjs-toploader';
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "@/components/ui/sonner"
import { Header } from "@/components/Header"
import "./globals.css";

export const metadata: Metadata = {
  title: "lende | Fine Jewelry Rental & Wholesale",
  description: "Premier fine jewelry rental and wholesale platform.",
};



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <NextTopLoader
          color="#0f172a"
          initialPosition={0.1}
          height={3}
          crawl={false}
          showSpinner={false}
          easing="ease-in-out"
          speed={320}
          shadow="none"
          zIndex={9999}
        />

        {/* Microsoft Clarity - production only */}
        {process.env.NODE_ENV === "production" && (
          <Script
            id="microsoft-clarity"
            strategy="afterInteractive"
          >
            {`
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "uoforod7kb");
            `}
          </Script>
        )}
        <Toaster position="top-center" duration={2000} />
        <Header />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
