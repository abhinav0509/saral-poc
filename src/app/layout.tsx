import type { Metadata, Viewport } from "next";
import { Inter, Mukta } from "next/font/google";
import { PWARegister } from "@/components/pwa/PWARegister";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const mukta = Mukta({
  variable: "--font-mukta",
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Saral · Care, made simple.",
  description:
    "Saral is a calm operations layer for small clinics. Walk-ins, live queues, and prescriptions — all in one place.",
  applicationName: "Saral",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Saral",
  },
  formatDetection: {
    telephone: false,
  },
  // Manifest is auto-linked by Next via src/app/manifest.ts
  // Icon links are auto-injected by Next from icon.tsx + apple-icon.tsx
};

export const viewport: Viewport = {
  themeColor: "#0E5E5A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${mukta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-surface-canvas text-text-primary">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
