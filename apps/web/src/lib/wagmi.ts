"use client";

import { createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const appUrl = typeof window === "undefined" ? "https://b20launcher.rakibhq.xyz" : window.location.origin;

const connectors = [
  injected({ shimDisconnect: true }),
  ...(walletConnectProjectId && typeof window !== "undefined"
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: "B20 Launcher",
            description: "Issue and manage native B20 tokens on Base.",
            url: appUrl,
            icons: ["https://b20launcher.rakibhq.xyz/brand/b20-app-icon.png"]
          }
        })
      ]
    : [])
];

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors,
  multiInjectedProviderDiscovery: true,
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
    [baseSepolia.id]: http("https://sepolia.base.org")
  }
});
