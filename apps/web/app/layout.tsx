import type { Metadata } from "next";

import "@fontsource-variable/eb-garamond";
import "@fontsource-variable/inter";
import "./globals.css";
import { Providers } from "../src/components/Providers";

export const metadata: Metadata = {
  title: "B20 Launcher | Issue on Base",
  description:
    "Professional, non-custodial B20 issuance on Base with Lighthouse permanent metadata and x402 agent tooling.",
  icons: {
    icon: "/brand/b20-app-icon.png",
    shortcut: "/brand/b20-app-icon.png",
    apple: "/brand/b20-app-icon.png"
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
