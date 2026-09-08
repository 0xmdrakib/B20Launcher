"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { useAccount, useConfig } from "wagmi";
import { getWalletClient, switchChain } from "wagmi/actions";
import { watchToken, type WalletToken } from "../lib/watch-token";
import { WalletControl } from "./WalletControl";

export function AddTokenToWallet({ token }: { token: WalletToken }) {
  const { isConnected } = useAccount();
  const wagmiConfig = useConfig();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function addToken() {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      let wallet = await getWalletClient(wagmiConfig);
      if (await wallet.getChainId() !== 8453) {
        await switchChain(wagmiConfig, { chainId: 8453 });
        wallet = await getWalletClient(wagmiConfig, { chainId: 8453 });
      }
      const added = await watchToken(wallet, token);
      setMessage(added ? "Token added to your wallet." : "Token was not added.");
    } catch (error) {
      const detail = error instanceof Error ? error.message.toLowerCase() : "";
      setMessage(/reject|denied|cancel/.test(detail)
        ? "Wallet request cancelled."
        : "Your wallet could not add this token. You can copy its address from the token page.");
    } finally {
      setPending(false);
    }
  }

  return <div className="add-token-wallet">
    {isConnected
      ? <button className="button secondary" type="button" onClick={addToken} disabled={pending}><Wallet size={16} />{pending ? "Check your wallet" : "Add to wallet"}</button>
      : <WalletControl />}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
