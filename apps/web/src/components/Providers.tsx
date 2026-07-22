"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useReconnect, WagmiProvider } from "wagmi";

import { wagmiConfig } from "../lib/wagmi";

function ReconnectAfterHydration() {
  const { reconnect } = useReconnect();

  useEffect(() => {
    reconnect();
  }, [reconnect]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <ReconnectAfterHydration />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
