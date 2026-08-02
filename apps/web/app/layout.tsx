import type { Metadata } from "next";

import "@fontsource-variable/eb-garamond";
import "@fontsource-variable/inter";
import "./globals.css";
import { Providers } from "../src/components/Providers";

const siteUrl = new URL("https://b20launcher.rakibhq.xyz");
const title = "B20 Launcher | Issue on Base";
const description =
  "Professional, non-custodial B20 issuance on Base with Lighthouse permanent metadata and x402 agent tooling.";
const socialImage = {
  url: "/brand/b20-launcher-social.png",
  width: 1200,
  height: 630,
  alt: "B20 Launcher",
  type: "image/png"
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title,
  description,
  applicationName: "B20 Launcher",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "B20 Launcher",
    title,
    description,
    images: [socialImage]
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [socialImage]
  },
  icons: {
    icon: "/brand/b20-app-icon.png",
    shortcut: "/brand/b20-app-icon.png",
    apple: "/brand/b20-app-icon.png"
  },
  other: {
    "base:app_id": "693add74e6be54f5ed71d645"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
