import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

// Concept E "Editorial Signal" type system: a characterful grotesque display
// face for the wordmark/headings, a refined grotesque for body, and Geist Mono
// for all data (room codes, times).
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--ff-display",
  display: "swap",
});
const body = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--ff-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://nus-vacansee.vercel.app"),
  title: "NUS Vacansee",
  description:
    "Find your free room nearby — real-time room availability on NUS campus.",
  authors: [{ name: "WANG BOYU", url: "https://github.com/CPLADRAGON" }],
  creator: "WANG BOYU",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vacansee",
  },
  openGraph: {
    type: "website",
    siteName: "NUS Vacansee",
    title: "NUS Vacansee — find a free room near you",
    description:
      "Real-time room availability on NUS campus. Find a vacant room nearby now, or check what's free at 2 PM.",
    url: "https://nus-vacansee.vercel.app",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "NUS Vacansee — real-time room availability on NUS campus",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NUS Vacansee — find a free room near you",
    description:
      "Real-time room availability on NUS campus. Find a vacant room nearby now, or check what's free at 2 PM.",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Set the theme class before first paint to avoid a flash of the wrong
  // theme. Reads the saved preference, falling back to the OS setting.
  const noFlashScript = `(function(){try{var s=localStorage.getItem('vacansee_theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s!=='light'&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${body.variable} ${display.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegister />
        <Analytics />
      </body>
    </html>
  );
}
