import { LaunchConsole } from "../src/components/LaunchConsole";
import { CapabilitiesBand, SiteFooter } from "../src/components/MarketingSections";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Reading request headers opts the homepage into dynamic rendering so the
  // per-request CSP nonce from proxy.ts can be attached to Next scripts.
  await headers();
  return <><LaunchConsole /><CapabilitiesBand /><SiteFooter /></>;
}
