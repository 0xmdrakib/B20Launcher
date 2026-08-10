"use client";

import { Bot, Check, Copy, Layers3, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { StepStatus, TokenLifecycleStatus } from "../lib/launch-workflow";

export type StepDefinition = { label: string; shortLabel: string; detail: string };

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-lockup ${compact ? "compact" : ""}`}>
      <img src="/brand/b20-launcher-approved.png" alt="B20 Launcher" className="brand-primary" width="196" height="34" />
      <img src="/brand/b20-mark-approved.png" alt="B20 Launcher" className="brand-compact" width="70" height="30" />
    </span>
  );
}

export function AppHeader({ apiUrl, walletControl }: { apiUrl: string; walletControl: ReactNode }) {
  return (
    <header className="topbar">
      <a className="brand" href="#top" aria-label="B20 Launcher home"><BrandLogo /></a>
      <div className="nav-actions">
        <a className="icon-button" href={`${apiUrl}/api/agents/manifest`} target="_blank" rel="noopener noreferrer" title="Agent manifest" aria-label="Open agent manifest"><Bot size={18} /></a>
        {walletControl}
      </div>
    </header>
  );
}

export function ProgressNav({ steps, current, statuses, onSelect }: { steps: StepDefinition[]; current: number; statuses: StepStatus[]; onSelect: (step: number) => void }) {
  const completedCount = statuses.filter((status) => status === "complete").length;
  const progress = Math.round(((completedCount + (statuses[current] === "current" ? 0.5 : 0)) / steps.length) * 100);
  return (
    <aside className="step-rail" aria-label="Launch progress">
      <div className="rail-heading" aria-live="polite"><span>Launch workflow</span><strong>{progress}%</strong></div>
      <div className="rail-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      <nav className="steps">
        {steps.map((item, index) => (
          <button key={item.label} type="button" aria-label={`${index + 1} ${item.label}: ${item.detail}`} aria-current={current === index ? "step" : undefined} className={`step ${current === index ? "active" : ""} ${statuses[index] === "complete" ? "complete" : ""}`} onClick={() => onSelect(index)}>
            <span className="step-index">{statuses[index] === "complete" ? <Check size={14} /> : index + 1}</span>
            <span className="step-copy"><strong className="step-long-label">{item.label}</strong><strong className="step-short-label">{item.shortLabel}</strong><small>{item.detail}</small></span>
          </button>
        ))}
      </nav>
      <div className="rail-note"><ShieldCheck size={18} /><div><strong>You keep control</strong><p>No private keys, custody or platform launch fee.</p></div></div>
    </aside>
  );
}

export type TokenPreviewModel = {
  image?: string;
  name: string;
  symbol: string;
  description: string;
  type: string;
  supply: string;
  mint: string;
  decimals: number;
  readiness: Array<{ label: string; done: boolean }>;
  lifecycleStatus: TokenLifecycleStatus;
  predictedToken?: string;
};

export function TokenPreviewContent({ model, onCopy }: { model: TokenPreviewModel; onCopy: (value: string) => void | Promise<void> }) {
  const readyCount = model.readiness.filter((item) => item.done).length;
  return (
    <div className="preview-inner">
      <div className="preview-heading"><span>Token preview</span><span className={`live-indicator status-${model.lifecycleStatus.toLowerCase().replace(/\s+/g, "-")}`}><i /> {model.lifecycleStatus}</span></div>
      <div className="token-identity">
        <div className="token-logo">{model.image ? <img src={model.image} alt="" width="68" height="68" /> : <span>{model.symbol.slice(0, 2) || "B2"}</span>}</div>
        <div><h2>{model.name || "Token name"}</h2><p>{model.symbol || "SYMBOL"}</p></div>
      </div>
      <p className="preview-description">{model.description || "Your public token description will appear here."}</p>
      <div className="preview-data">
        <div><span>Type</span><strong>{model.type}</strong></div><div><span>Max supply</span><strong>{model.supply}</strong></div><div><span>Initial mint</span><strong>{model.mint}</strong></div><div><span>Decimals</span><strong>{model.decimals}</strong></div>
      </div>
      <div className="readiness">
        <div className="readiness-head"><span>Launch readiness</span><strong>{readyCount}/{model.readiness.length}</strong></div>
        <ul>{model.readiness.map((item, index) => <li className={item.done ? "done" : ""} key={item.label}><span>{item.done ? <Check size={13} /> : index + 1}</span>{item.label}</li>)}</ul>
      </div>
      {model.predictedToken ? <div className="predicted"><span>Predicted token address</span><strong>{model.predictedToken}</strong><button type="button" onClick={() => void onCopy(model.predictedToken!)} title="Copy predicted address" aria-label="Copy predicted address"><Copy size={15} /></button></div> : null}
      <div className="powered"><Layers3 size={16} /><span>Metadata permanence by <strong>Lighthouse</strong></span></div>
    </div>
  );
}

export function PreviewDialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) { dialog.showModal(); document.body.classList.add("dialog-open"); }
    else if (!open && dialog.open) dialog.close();
    return () => document.body.classList.remove("dialog-open");
  }, [open]);

  return <dialog ref={dialogRef} className="preview-dialog" onClose={() => { document.body.classList.remove("dialog-open"); onClose(); }} onCancel={onClose} aria-label="Token preview"><div className="dialog-handle" aria-hidden="true" /><div className="dialog-head"><strong id="preview-dialog-title">Token preview</strong><button type="button" className="icon-button" onClick={onClose} title="Close preview" aria-label="Close preview"><X size={18} /></button></div>{children}</dialog>;
}

export function ConfirmDialog({ open, onConfirm, onClose }: { open: boolean; onConfirm: () => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) { dialog.showModal(); window.requestAnimationFrame(() => cancelRef.current?.focus()); }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog ref={dialogRef} className="confirm-dialog" onCancel={onClose} onClose={onClose} aria-labelledby="reset-dialog-title"><div className="dialog-head"><strong id="reset-dialog-title">Start a new launch?</strong><button type="button" className="icon-button" onClick={onClose} aria-label="Keep this draft"><X size={18} /></button></div><div className="confirm-dialog-body"><p>This clears the current form and staged metadata from this browser. Nothing has been sent to Base.</p><div className="confirm-actions"><button ref={cancelRef} type="button" className="button secondary" onClick={onClose}>Keep draft</button><button type="button" className="button primary" onClick={onConfirm}>Clear draft</button></div></div></dialog>;
}
