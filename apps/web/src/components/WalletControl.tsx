"use client";

import { LoaderCircle, Power, Wallet, WalletCards, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function shortAddress(value?: string) {
  if (!value) return "Wallet";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function friendlyConnectionError(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes("user rejected") || message.includes("user denied")) {
    return "Connection request was cancelled.";
  }
  if (message.includes("project id")) {
    return "WalletConnect is not available right now.";
  }
  return "The wallet could not be connected. Please try again.";
}

export function WalletControl() {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState("");
  const [connectingUid, setConnectingUid] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const walletConnectConnector = connectors.find((connector) => connector.id === "walletConnect");
  const browserConnectors = useMemo(() => {
    const discovered = connectors.filter(
      (connector) => connector.id !== "walletConnect" && connector.id !== "injected"
    );
    if (discovered.length > 0) return discovered;

    const hasInjectedProvider =
      typeof window !== "undefined" && Boolean((window as Window & { ethereum?: unknown }).ethereum);
    return hasInjectedProvider ? connectors.filter((connector) => connector.id === "injected") : [];
  }, [connectors]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      document.body.classList.add("wallet-dialog-open");
    } else if (!open && dialog.open) {
      dialog.close();
    }

    return () => document.body.classList.remove("wallet-dialog-open");
  }, [open]);

  useEffect(() => {
    if (!connectError) return;
    setLocalError(friendlyConnectionError(connectError));
  }, [connectError]);

  function closeDialog() {
    setOpen(false);
    setLocalError("");
    document.body.classList.remove("wallet-dialog-open");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function chooseWallet(connector: (typeof connectors)[number]) {
    setLocalError("");
    setConnectingUid(connector.uid);
    const usesWalletConnect = connector.id === "walletConnect";
    if (usesWalletConnect) {
      setOpen(false);
      dialogRef.current?.close();
      document.body.classList.remove("wallet-dialog-open");
    }
    try {
      await connectAsync({ connector });
      if (!usesWalletConnect) closeDialog();
    } catch (error) {
      setLocalError(friendlyConnectionError(error instanceof Error ? error : new Error("Connection failed")));
    } finally {
      setConnectingUid("");
    }
  }

  if (isConnected) {
    return (
      <div className="wallet-pill connected" aria-label={`Connected wallet ${address ?? ""}`}>
        <span className="wallet-status-dot" aria-hidden="true" />
        <span className="wallet-address">{shortAddress(address)}</span>
        <button
          type="button"
          className="wallet-disconnect"
          onClick={() => disconnect()}
          title="Disconnect wallet"
          aria-label="Disconnect wallet"
        >
          <Power size={17} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="wallet-pill disconnected"
        onClick={() => {
          setLocalError("");
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <span className="wallet-status-dot" aria-hidden="true" />
        <span>Connect Wallet</span>
      </button>

      <dialog
        ref={dialogRef}
        className="wallet-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => {
          setOpen(false);
          document.body.classList.remove("wallet-dialog-open");
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="wallet-dialog-panel">
          {open ? <>
          <header className="wallet-dialog-head">
            <div>
              <h2 id={titleId}>Choose wallet</h2>
              <p id={descriptionId}>Select an installed browser wallet to connect.</p>
            </div>
            <button type="button" className="wallet-dialog-close" onClick={closeDialog} aria-label="Close wallet selection">
              <X size={20} />
            </button>
          </header>

          <div className="wallet-options" aria-label="Installed browser wallets">
            {browserConnectors.length > 0 ? browserConnectors.map((connector) => {
              const connecting = isPending && connectingUid === connector.uid;
              return (
                <button
                  type="button"
                  className="wallet-option"
                  key={connector.uid}
                  onClick={() => void chooseWallet(connector)}
                  disabled={isPending}
                >
                  <span className="wallet-option-icon">
                    {connector.icon ? <img src={connector.icon} alt="" /> : <Wallet size={21} />}
                  </span>
                  <span className="wallet-option-copy"><strong>{connector.name}</strong><small>Browser extension</small></span>
                  {connecting ? <LoaderCircle className="wallet-spinner" size={18} /> : null}
                </button>
              );
            }) : (
              <div className="wallet-empty">
                <Wallet size={20} />
                <div><strong>No browser wallet detected</strong><small>Install or enable an EVM wallet, then refresh this page.</small></div>
              </div>
            )}
          </div>

          {walletConnectConnector ? (
            <div className="walletconnect-section">
              <button
                type="button"
                className="wallet-option walletconnect-option"
                onClick={() => void chooseWallet(walletConnectConnector)}
                disabled={isPending}
              >
                <span className="wallet-option-icon walletconnect-icon"><WalletCards size={21} /></span>
                <span className="wallet-option-copy"><strong>WalletConnect</strong><small>Scan with a mobile wallet</small></span>
                {isPending && connectingUid === walletConnectConnector.uid ? <LoaderCircle className="wallet-spinner" size={18} /> : null}
              </button>
            </div>
          ) : null}

          {localError ? <p className="wallet-dialog-error" role="alert">{localError}</p> : null}
          <button type="button" className="wallet-cancel" onClick={closeDialog}>Cancel</button>
          </> : null}
        </div>
      </dialog>
    </>
  );
}
