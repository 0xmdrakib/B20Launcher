"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  Eye,
  ExternalLink,
  FileImage,
  Globe2,
  KeyRound,
  Layers3,
  Network,
  Rocket,
  RotateCcw,
  ShieldCheck,
  UploadCloud,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, getAddress, isAddress, parseUnits, type Address, type Hex } from "viem";
import { base } from "wagmi/chains";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWalletClient
} from "wagmi";

import { ZERO_ADDRESS, type LaunchDraftInput, type UnsignedLaunchTransaction } from "@base-b20/b20";

import { API_URL, commitMetadata, prepareMetadata, quoteLaunch, type PreparedMetadataResponse, type QuoteResponse } from "../lib/api";
import {
  AppHeader,
  CapabilitiesBand,
  PreviewDialog,
  ProgressNav,
  SiteFooter,
  TokenPreviewContent,
  type TokenPreviewModel
} from "./LauncherUi";
import { WalletControl } from "./WalletControl";

type Variant = "asset" | "stablecoin";

const steps = [
  { label: "Identity", shortLabel: "Identity", detail: "Brand and public metadata" },
  { label: "Economics", shortLabel: "Supply", detail: "Supply and initial issuance" },
  { label: "Control", shortLabel: "Control", detail: "Roles, policies and safety" },
  { label: "Review", shortLabel: "Review", detail: "Verify and sign on Base" }
];

const initialForm = {
  variant: "asset" as Variant,
  name: "",
  symbol: "",
  description: "",
  externalLink: "",
  admin: "",
  decimals: 18,
  currency: "USD",
  supplyCap: "1000000000",
  mintRecipient: "",
  mintAmount: "500000000",
  minter: "",
  metadataAdmin: "",
  pauser: "",
  burner: "",
  operator: "",
  transferSenderPolicy: "",
  transferReceiverPolicy: "",
  mintReceiverPolicy: "",
  pauseTransfer: false,
  pauseMint: false,
  pauseBurn: false,
  extraKey: "category",
  extraValue: "RWA"
};
type FieldKey = keyof typeof initialForm | "logo";

const DRAFT_KEY = "b20-launcher-launch-draft-v5";
const PREVIOUS_DRAFT_KEYS = [
  "b20-launcher-launch-draft-v4",
  "b20-launcher-launch-draft-v3",
  "b20-launcher-launch-draft-v2",
  "b20-forge-launch-draft-v1"
];

function shortAddress(value?: string) {
  if (!value) return "Not set";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function compactCid(value?: string) {
  if (!value) return "Pending";
  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

function normalizeAddressOrEmpty(value: string): Address | "" {
  return isAddress(value) ? (getAddress(value) as Address) : "";
}

function copy(value: string) {
  void navigator.clipboard?.writeText(value);
}

function parseAmount(value: string, decimals: number): bigint | null {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const fraction = normalized.split(".")[1] ?? "";
  if (fraction.length > decimals) return null;
  try {
    return parseUnits(normalized, decimals);
  } catch {
    return null;
  }
}

function displayAmount(value: string) {
  const [whole = "0", fraction] = value.split(".");
  const grouped = /^\d+$/.test(whole) ? BigInt(whole || "0").toLocaleString("en-US") : value;
  return fraction ? `${grouped}.${fraction}` : grouped;
}

export function LaunchConsole() {
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(0);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [prepared, setPrepared] = useState<PreparedMetadataResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [mintAmountManuallyEdited, setMintAmountManuallyEdited] = useState(false);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(DRAFT_KEY) ??
        PREVIOUS_DRAFT_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<typeof initialForm>;
        if (parsed && typeof parsed === "object") {
          const usedPreviousDefault =
            parsed.supplyCap === "1000000" &&
            (parsed.mintAmount === "1000" || parsed.mintAmount === "500000");
          const migrated = {
            ...parsed,
            ...(usedPreviousDefault ? { supplyCap: "1000000000", mintAmount: "500000000" } : {}),
            ...(parsed.name === "Northstar Credit" ? { name: "" } : {}),
            ...(parsed.symbol === "NST" ? { symbol: "" } : {}),
            ...(parsed.description ===
            "A Base-native B20 asset with transparent issuance, public metadata and programmable controls."
              ? { description: "" }
              : {}),
            ...(parsed.externalLink === "https://example.com" ? { externalLink: "" } : {})
          };
          setForm((current) => ({ ...current, ...migrated }));
          setMintAmountManuallyEdited(Boolean(parsed.mintAmount) && !usedPreviousDefault);
          window.localStorage.setItem(DRAFT_KEY, JSON.stringify(migrated));
          PREVIOUS_DRAFT_KEYS.forEach((key) => window.localStorage.removeItem(key));
        }
      }
    } catch {
      window.localStorage.removeItem(DRAFT_KEY);
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    setDraftSaved(false);
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      setDraftSaved(true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftReady, form]);

  useEffect(() => {
    if (!logo) {
      setLogoPreview("");
      return;
    }
    const url = URL.createObjectURL(logo);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const admin = normalizeAddressOrEmpty(form.admin) || address || ZERO_ADDRESS;
  const routerIsConfigured = quote?.transaction.to !== ZERO_ADDRESS;
  const metadataReady = Boolean(prepared?.stageId && prepared.contract.uri);
  const storageReady = prepared?.storage.verified === true;
  const identityReady = Boolean(form.name.trim() && form.symbol.trim() && form.description.trim() && logo);
  const tokenDecimals = form.variant === "asset" ? form.decimals : 6;
  const supplyCapUnits = parseAmount(form.supplyCap, tokenDecimals);
  const mintAmountUnits = parseAmount(form.mintAmount || "0", tokenDecimals);
  const economicsReady = Boolean(
    supplyCapUnits && supplyCapUnits > 0n && mintAmountUnits !== null && mintAmountUnits <= supplyCapUnits
  );
  const completedSteps = [metadataReady, step > 1 || Boolean(quote), step > 2 || Boolean(quote), Boolean(hash)];
  const previewImage = prepared?.logo?.gatewayUrls[0] || logoPreview;

  const fieldErrors = useMemo<Partial<Record<FieldKey, string>>>(() => {
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!form.name.trim()) errors.name = "Token name is required.";
    if (!form.symbol.trim()) errors.symbol = "Symbol is required.";
    if (!form.description.trim()) errors.description = "Description is required.";
    if (form.description.length > 2000) errors.description = "Description must be 2,000 characters or fewer.";
    if (!logo) errors.logo = "Choose a PNG, JPEG or WebP logo up to 1 MB.";
    if (form.admin.trim() && !isAddress(form.admin)) errors.admin = "Enter a valid Base address.";
    if (!form.admin.trim() && !address) errors.admin = "Connect a wallet or enter an admin address.";
    if (form.variant === "asset" && (form.decimals < 6 || form.decimals > 18)) errors.decimals = "Use 6 to 18 decimals.";
    if (form.variant === "stablecoin" && !/^[A-Z]{3}$/.test(form.currency)) errors.currency = "Use a three-letter uppercase currency code.";
    if (supplyCapUnits === null || supplyCapUnits <= 0n) errors.supplyCap = "Enter a supply greater than zero.";
    if (mintAmountUnits === null) errors.mintAmount = `Use at most ${tokenDecimals} decimal places.`;
    else if (supplyCapUnits !== null && mintAmountUnits > supplyCapUnits) errors.mintAmount = "Initial mint cannot exceed maximum supply.";
    if (form.mintRecipient.trim() && !isAddress(form.mintRecipient)) errors.mintRecipient = "Enter a valid Base address or leave empty.";
    for (const key of ["minter", "metadataAdmin", "pauser", "burner", "operator"] as const) {
      if (form[key].trim() && !isAddress(form[key])) errors[key] = "Enter a valid Base address or leave empty.";
    }
    return errors;
  }, [address, form, logo, mintAmountUnits, supplyCapUnits, tokenDecimals]);

  function touch(...keys: FieldKey[]) {
    setTouched((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, true])) }));
  }

  function visibleFieldError(key: FieldKey) {
    return touched[key] ? fieldErrors[key] : undefined;
  }

  const launchPayload = useMemo<LaunchDraftInput>(() => {
    const roles: Record<string, Address> = {};
    const minter = normalizeAddressOrEmpty(form.minter);
    const metadataAdmin = normalizeAddressOrEmpty(form.metadataAdmin);
    const pauser = normalizeAddressOrEmpty(form.pauser);
    const burner = normalizeAddressOrEmpty(form.burner);
    const operator = normalizeAddressOrEmpty(form.operator);

    if (minter) roles.MINT_ROLE = minter;
    if (metadataAdmin) roles.METADATA_ROLE = metadataAdmin;
    if (pauser) {
      roles.PAUSE_ROLE = pauser;
      roles.UNPAUSE_ROLE = pauser;
    }
    if (burner) {
      roles.BURN_ROLE = burner;
      roles.BURN_BLOCKED_ROLE = burner;
    }
    if (operator) roles.OPERATOR_ROLE = operator;

    const policies: Record<string, string> = {};
    if (form.transferSenderPolicy) policies.TRANSFER_SENDER_POLICY = form.transferSenderPolicy;
    if (form.transferReceiverPolicy) policies.TRANSFER_RECEIVER_POLICY = form.transferReceiverPolicy;
    if (form.mintReceiverPolicy) policies.MINT_RECEIVER_POLICY = form.mintReceiverPolicy;

    const pauseFeatures: Array<"TRANSFER" | "MINT" | "BURN"> = [];
    if (form.pauseTransfer) pauseFeatures.push("TRANSFER");
    if (form.pauseMint) pauseFeatures.push("MINT");
    if (form.pauseBurn) pauseFeatures.push("BURN");

    const mintRecipient = normalizeAddressOrEmpty(form.mintRecipient) || admin;

    return {
      variant: form.variant,
      name: form.name,
      symbol: form.symbol.toUpperCase(),
      description: form.description,
      externalLink: form.externalLink,
      contractURI: prepared?.contract.uri ?? "",
      admin,
      supplyCap: form.supplyCap,
      decimals: form.variant === "asset" ? form.decimals : undefined,
      currency: form.variant === "stablecoin" ? form.currency : undefined,
      roles,
      initialMints: form.mintAmount && mintRecipient ? [{ recipient: mintRecipient, amount: form.mintAmount }] : [],
      policies,
      pauseFeatures,
      extraMetadata:
        form.variant === "asset" && form.extraKey
          ? [{ key: form.extraKey, value: form.extraValue }]
          : []
    };
  }, [admin, form, prepared?.contract.uri]);

  function setField<K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setQuote(null);
    if (["variant", "name", "symbol", "description", "externalLink"].includes(key)) setPrepared(null);
    setError("");
    setSuccess("");
  }

  function setSupplyCap(value: string) {
    const units = parseAmount(value, tokenDecimals);
    setForm((current) => ({
      ...current,
      supplyCap: value,
      ...(!mintAmountManuallyEdited && units !== null
        ? { mintAmount: formatUnits(units / 2n, tokenDecimals) }
        : {})
    }));
    setQuote(null);
    setError("");
    setSuccess("");
  }

  function selectLogo(file: File | null) {
    touch("logo");
    if (file && file.size > 1_000_000) {
      setLogo(null);
      setPrepared(null);
      setQuote(null);
      setError("Logo must be 1 MB or smaller.");
      return;
    }
    setLogo(file);
    setPrepared(null);
    setQuote(null);
    setError("");
  }

  function resetDraft() {
    setForm(initialForm);
    setStep(0);
    setLogo(null);
    setPrepared(null);
    setQuote(null);
    setHash("");
    setError("");
    setSuccess("");
    setTouched({});
    setMintAmountManuallyEdited(false);
    window.localStorage.removeItem(DRAFT_KEY);
    PREVIOUS_DRAFT_KEYS.forEach((key) => window.localStorage.removeItem(key));
  }

  function requestResetDraft() {
    if (window.confirm("Clear this launch draft and start a new one?")) resetDraft();
  }

  async function handlePrepareMetadata() {
    if (!identityReady) {
      touch("name", "symbol", "description", "logo");
      setError("Complete the identity fields and choose a logo first.");
      return;
    }
    setBusy("metadata");
    setError("");
    setSuccess("");
    try {
      const body = new FormData();
      body.append("name", form.name);
      body.append("symbol", form.symbol);
      body.append("description", form.description);
      body.append("externalLink", form.externalLink);
      body.append("variant", form.variant);
      if (logo) body.append("logo", logo);
      const result = await prepareMetadata(body);
      setPrepared(result);
      setSuccess("Metadata is staged with deterministic CIDs. Lighthouse publication happens only after launch submission.");
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stage token metadata.");
    } finally {
      setBusy("");
    }
  }

  function getEconomicsError(): string {
    if (admin === ZERO_ADDRESS) return "Connect a wallet or enter a valid admin wallet.";
    if (supplyCapUnits === null || supplyCapUnits <= 0n || mintAmountUnits === null) {
      return `Supply cap and initial mint must be valid amounts with at most ${tokenDecimals} decimals.`;
    }
    if (mintAmountUnits > supplyCapUnits) return "Initial mint cannot exceed the maximum supply.";
    if (form.variant === "asset" && (form.decimals < 6 || form.decimals > 18)) {
      return "Asset decimals must be between 6 and 18.";
    }
    if (form.variant === "stablecoin" && !/^[A-Z]{3}$/.test(form.currency)) {
      return "Stablecoin currency must be a three-letter uppercase ISO code.";
    }
    if (form.mintRecipient.trim() && !isAddress(form.mintRecipient)) {
      return "Initial recipient must be a valid Base address or left empty.";
    }
    return "";
  }

  function handleEconomicsContinue() {
    touch("admin", "decimals", "currency", "supplyCap", "mintAmount", "mintRecipient");
    const issue = getEconomicsError();
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    setStep(2);
  }

  async function handleQuote() {
    if (!metadataReady) {
      setError("Stage token metadata before building the transaction.");
      setStep(0);
      return;
    }
    const economicsIssue = getEconomicsError();
    if (economicsIssue) {
      setError(economicsIssue);
      setStep(1);
      return;
    }
    const addressFields = [
      ["Minter", form.minter],
      ["Metadata admin", form.metadataAdmin],
      ["Pause operator", form.pauser],
      ["Burn operator", form.burner],
      ["Asset operator", form.operator]
    ] as const;
    const invalidAddress = addressFields.find(([, value]) => value.trim() && !isAddress(value));
    if (invalidAddress) {
      touch("minter", "metadataAdmin", "pauser", "burner", "operator");
      setError(`${invalidAddress[0]} must be a valid Base address or left empty.`);
      setStep(2);
      return;
    }
    setBusy("quote");
    setError("");
    setSuccess("");
    try {
      if (!prepared?.stageToken) throw new Error("Secure metadata stage token is missing. Prepare metadata again.");
      const result = await quoteLaunch(launchPayload, prepared.stageId, prepared.stageToken);
      setQuote(result);
      setStep(3);
      setSuccess("Unsigned launch transaction is ready for final review.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build launch transaction.");
    } finally {
      setBusy("");
    }
  }

  async function handleSend() {
    if (!quote) return;
    if (!walletClient || !address) {
      setError("Connect a wallet before signing the launch.");
      return;
    }
    if (!routerIsConfigured) {
      setError("The B20 launch router is not configured for mainnet yet.");
      return;
    }

    setBusy("send");
    setError("");
    setSuccess("");
    try {
      if (chainId !== quote.transaction.chainId) await switchChainAsync({ chainId: quote.transaction.chainId });
      const txHash = await walletClient.sendTransaction({
        account: address,
        chain: base,
        to: quote.transaction.to as Address,
        data: quote.transaction.attributedData as Hex,
        value: 0n
      });
      setHash(txHash);
      setSuccess("Launch submitted to Base. Publishing the staged metadata now.");
      try {
        if (!prepared) throw new Error("Metadata stage is missing.");
        const committed = await commitMetadata({
          stageId: prepared.stageId,
          stageToken: prepared.stageToken ?? "",
          idempotencyKey: quote.transaction.idempotencyKey,
          txHash
        });
        setPrepared(committed);
        setSuccess("Launch submitted and metadata verified through Lighthouse.");
      } catch (commitError) {
        setError(
          commitError instanceof Error
            ? `Transaction submitted, but metadata publication needs a retry: ${commitError.message}`
            : "Transaction submitted, but metadata publication needs a retry."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction was not submitted.");
    } finally {
      setBusy("");
    }
  }

  async function handleCommitRetry() {
    if (!hash || !quote || !prepared) return;
    setBusy("commit");
    setError("");
    try {
      const committed = await commitMetadata({
        stageId: prepared.stageId,
        stageToken: prepared.stageToken ?? "",
        idempotencyKey: quote.transaction.idempotencyKey,
        txHash: hash
      });
      setPrepared(committed);
      setSuccess("Metadata is live and verified through Lighthouse.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Metadata publication could not be completed.");
    } finally {
      setBusy("");
    }
  }

  const transaction: UnsignedLaunchTransaction | undefined = quote?.transaction;
  const currentStep = steps[step] ?? steps[0]!;
  const economicsIssue = getEconomicsError();
  const previewModel: TokenPreviewModel = {
    ...(previewImage ? { image: previewImage } : {}),
    name: form.name,
    symbol: form.symbol,
    description: form.description,
    type: form.variant === "asset" ? "B20 Asset" : `${form.currency} Stablecoin`,
    supply: `${displayAmount(form.supplyCap || "0")} ${form.symbol}`,
    mint: `${displayAmount(form.mintAmount || "0")} ${form.symbol}`,
    decimals: tokenDecimals,
    readiness: [
      { label: storageReady ? "Metadata live" : "Metadata staged", done: metadataReady },
      { label: "Supply configured", done: economicsReady },
      { label: "Admin wallet", done: admin !== ZERO_ADDRESS },
      { label: "Transaction built", done: Boolean(quote) }
    ],
    ...(quote?.predictedToken ? { predictedToken: quote.predictedToken } : {})
  };

  return (
    <main className="app-shell" data-ready={draftReady ? "true" : "false"}>
      <AppHeader apiUrl={API_URL} walletControl={<WalletControl />} />

      <div className="context-bar" id="top">
        <div><span>New issuance</span><strong>{form.name || "Untitled token"}</strong><em className={draftSaved ? "saved" : "saving"}><Check size={11} />{draftSaved ? "Saved locally" : "Saving"}</em><button className="draft-reset" onClick={requestResetDraft} title="Start a new launch" aria-label="Start a new launch and clear the current draft"><RotateCcw size={13} /><span>New draft</span></button></div>
        <div className="context-trust"><ShieldCheck size={15} /> Non-custodial <span /> <Zap size={15} /> One transaction <span /> <Globe2 size={15} /> Lighthouse IPFS</div>
      </div>

      <div className="launch-layout">
        <ProgressNav steps={steps} current={step} completed={completedSteps} onSelect={setStep} />

        <section className="workbench">
          <div className="workbench-head">
            <div><span className="eyebrow">Step {step + 1} of 4</span><h1>{currentStep.label}</h1><p>{currentStep.detail}</p></div>
            <span className="variant-chip">{form.variant === "asset" ? "B20 Asset" : "B20 Stablecoin"}</span>
          </div>

          {error ? <div className="notice error"><AlertTriangle size={17} /><span>{error}</span></div> : null}
          {success ? <div className="notice success"><CheckCircle2 size={17} /><span>{success}</span></div> : null}

          {step === 0 ? (
            <div className="step-content">
              <div className="section-row"><div><h2>Token profile</h2><p>This public identity is written into your ERC-7572 contract metadata.</p></div><div className="segmented" aria-label="Token variant">
                <button className={form.variant === "asset" ? "active" : ""} onClick={() => setField("variant", "asset")}>Asset</button>
                <button className={form.variant === "stablecoin" ? "active" : ""} onClick={() => setField("variant", "stablecoin")}>Stablecoin</button>
              </div></div>
              <div className="identity-grid">
                <div className="identity-side">
                  <label className="logo-drop">
                    <input type="file" accept="image/png,image/jpeg,image/webp" aria-invalid={Boolean(visibleFieldError("logo"))} onChange={(event) => selectLogo(event.target.files?.[0] ?? null)} />
                    {previewImage ? <img src={previewImage} alt="Token logo preview" /> : <span className="logo-placeholder"><UploadCloud size={26} /><strong>Upload logo</strong><small>PNG, JPEG or WebP</small><small className="logo-limit">Maximum 1 MB</small></span>}
                    <span className="logo-action"><FileImage size={14} /> {logo ? "Replace image" : "Choose image"}</span>
                  </label>
                  <div className={`storage-proof compact ${metadataReady ? "verified" : ""}`}>
                    <div className="storage-logo"><Layers3 size={19} /></div>
                    <div><strong>Protected staging</strong><p>Published only after the matching launch is submitted.</p></div>
                    {storageReady ? <span className="proof-state"><CheckCircle2 size={14} /> Live</span> : metadataReady ? <span className="proof-state"><CheckCircle2 size={14} /> Staged</span> : <span className="proof-state pending">Not staged</span>}
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field"><span>Token name</span><input placeholder="e.g. Northstar Credit" value={form.name} aria-invalid={Boolean(visibleFieldError("name"))} onBlur={() => touch("name")} onChange={(event) => setField("name", event.target.value)} />{visibleFieldError("name") ? <small className="field-error">{visibleFieldError("name")}</small> : null}</label>
                  <label className="field"><span>Symbol</span><input placeholder="e.g. NST" value={form.symbol} maxLength={32} aria-invalid={Boolean(visibleFieldError("symbol"))} onBlur={() => touch("symbol")} onChange={(event) => setField("symbol", event.target.value.toUpperCase())} />{visibleFieldError("symbol") ? <small className="field-error">{visibleFieldError("symbol")}</small> : null}</label>
                  <label className="field full"><span>Description</span><textarea placeholder="Describe the asset, its purpose, and the issuer." value={form.description} maxLength={2000} aria-invalid={Boolean(visibleFieldError("description"))} onBlur={() => touch("description")} onChange={(event) => setField("description", event.target.value)} /><small className={visibleFieldError("description") ? "field-error" : ""}>{visibleFieldError("description") ?? `${form.description.length}/2000 characters`}</small></label>
                  <label className="field full"><span>Project website</span><input placeholder="https://yourproject.com" value={form.externalLink} onChange={(event) => setField("externalLink", event.target.value)} /></label>
                </div>
              </div>
              {prepared ? <div className="cid-grid"><div><span>Logo CID</span><strong>{compactCid(prepared.logo?.cid)}</strong><button onClick={() => prepared.logo && copy(prepared.logo.cid)} title="Copy logo CID"><Copy size={14} /></button></div><div><span>Contract metadata CID</span><strong>{compactCid(prepared.contract.cid)}</strong><button onClick={() => copy(prepared.contract.cid)} title="Copy metadata CID"><Copy size={14} /></button></div></div> : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="step-content">
              <div className="section-row"><div><h2>Supply design</h2><p>Define hard limits and the first issuance. Values are validated before calldata is built.</p></div></div>
              <div className="form-grid economics-grid">
                <label className="field"><span>Admin wallet or multisig</span><input placeholder={address ?? "0x..."} value={form.admin} aria-invalid={Boolean(visibleFieldError("admin"))} onBlur={() => touch("admin")} onChange={(event) => setField("admin", event.target.value)} /><small className={visibleFieldError("admin") ? "field-error" : ""}>{visibleFieldError("admin") ?? "Connected wallet is used when left empty."}</small></label>
                {form.variant === "asset" ? <label className="field"><span>Decimals</span><input type="number" min={6} max={18} value={form.decimals} aria-invalid={Boolean(visibleFieldError("decimals"))} onBlur={() => touch("decimals")} onChange={(event) => setField("decimals", Number(event.target.value))} /><small className={visibleFieldError("decimals") ? "field-error" : ""}>{visibleFieldError("decimals") ?? "B20 assets support 6 to 18 decimals."}</small></label> : <label className="field"><span>ISO currency code</span><input value={form.currency} maxLength={3} aria-invalid={Boolean(visibleFieldError("currency"))} onBlur={() => touch("currency")} onChange={(event) => setField("currency", event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} /><small className={visibleFieldError("currency") ? "field-error" : ""}>{visibleFieldError("currency") ?? "Stablecoins use fixed 6 decimals."}</small></label>}
                <label className="field"><span>Maximum supply</span><div className="input-suffix"><input inputMode="decimal" value={form.supplyCap} aria-invalid={Boolean(visibleFieldError("supplyCap"))} onBlur={() => touch("supplyCap")} onChange={(event) => setSupplyCap(event.target.value)} /><b>{form.symbol || "TOKEN"}</b></div>{visibleFieldError("supplyCap") ? <small className="field-error">{visibleFieldError("supplyCap")}</small> : <small>Initial mint follows 50% until you edit it.</small>}</label>
                <label className="field"><span>Initial mint</span><div className="input-suffix"><input inputMode="decimal" value={form.mintAmount} aria-invalid={Boolean(visibleFieldError("mintAmount"))} onBlur={() => touch("mintAmount")} onChange={(event) => { setMintAmountManuallyEdited(true); setField("mintAmount", event.target.value); }} /><b>{form.symbol || "TOKEN"}</b></div>{visibleFieldError("mintAmount") ? <small className="field-error">{visibleFieldError("mintAmount")}</small> : <small>Defaults to 50% of maximum supply.</small>}</label>
                <label className="field full"><span>Initial recipient</span><input placeholder={shortAddress(admin)} value={form.mintRecipient} aria-invalid={Boolean(visibleFieldError("mintRecipient"))} onBlur={() => touch("mintRecipient")} onChange={(event) => setField("mintRecipient", event.target.value)} /><small className={visibleFieldError("mintRecipient") ? "field-error" : ""}>{visibleFieldError("mintRecipient") ?? "Defaults to your connected wallet, or the custom token admin when set."}</small></label>
              </div>
              {economicsIssue ? <div className="inline-guidance"><AlertTriangle size={15} /><span>{economicsIssue}</span></div> : <div className="inline-guidance valid"><CheckCircle2 size={15} /><span>Supply design is internally consistent.</span></div>}
              <div className="allocation-summary"><div><span>Initial circulation</span><strong>{displayAmount(form.mintAmount || "0")} {form.symbol}</strong></div><div><span>Unissued capacity</span><strong>{supplyCapUnits !== null && mintAmountUnits !== null && supplyCapUnits >= mintAmountUnits ? displayAmount(formatUnits(supplyCapUnits - mintAmountUnits, tokenDecimals)) : "Invalid"} {form.symbol}</strong></div><div><span>Admin</span><strong>{shortAddress(admin)}</strong></div></div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="step-content">
              <div className="section-row"><div><h2>Permission architecture</h2><p>Use separate operational wallets or leave roles empty to keep the launch minimal.</p></div></div>
              <div className="form-grid">
                <label className="field"><span>Minter</span><input placeholder="0x... optional" value={form.minter} aria-invalid={Boolean(visibleFieldError("minter"))} onBlur={() => touch("minter")} onChange={(event) => setField("minter", event.target.value)} />{visibleFieldError("minter") ? <small className="field-error">{visibleFieldError("minter")}</small> : null}</label>
                <label className="field"><span>Metadata admin</span><input placeholder="0x... optional" value={form.metadataAdmin} aria-invalid={Boolean(visibleFieldError("metadataAdmin"))} onBlur={() => touch("metadataAdmin")} onChange={(event) => setField("metadataAdmin", event.target.value)} />{visibleFieldError("metadataAdmin") ? <small className="field-error">{visibleFieldError("metadataAdmin")}</small> : null}</label>
                <label className="field"><span>Pause operator</span><input placeholder="0x... optional" value={form.pauser} aria-invalid={Boolean(visibleFieldError("pauser"))} onBlur={() => touch("pauser")} onChange={(event) => setField("pauser", event.target.value)} />{visibleFieldError("pauser") ? <small className="field-error">{visibleFieldError("pauser")}</small> : null}</label>
                <label className="field"><span>Burn operator</span><input placeholder="0x... optional" value={form.burner} aria-invalid={Boolean(visibleFieldError("burner"))} onBlur={() => touch("burner")} onChange={(event) => setField("burner", event.target.value)} />{visibleFieldError("burner") ? <small className="field-error">{visibleFieldError("burner")}</small> : null}</label>
                {form.variant === "asset" ? <label className="field"><span>Asset operator</span><input placeholder="0x... optional" value={form.operator} aria-invalid={Boolean(visibleFieldError("operator"))} onBlur={() => touch("operator")} onChange={(event) => setField("operator", event.target.value)} />{visibleFieldError("operator") ? <small className="field-error">{visibleFieldError("operator")}</small> : null}</label> : null}
                {form.variant === "asset" ? <label className="field"><span>Asset classification</span><div className="field-pair"><input value={form.extraKey} onChange={(event) => setField("extraKey", event.target.value)} /><input value={form.extraValue} onChange={(event) => setField("extraValue", event.target.value)} /></div></label> : null}
              </div>
              <div className="subsection"><div><h3>Policy registry</h3><p>Optional onchain policy IDs for controlled transfers and minting.</p></div></div>
              <div className="form-grid policy-grid">
                <label className="field"><span>Sender policy ID</span><input placeholder="Leave empty for unrestricted" value={form.transferSenderPolicy} onChange={(event) => setField("transferSenderPolicy", event.target.value)} /></label>
                <label className="field"><span>Receiver policy ID</span><input placeholder="Leave empty for unrestricted" value={form.transferReceiverPolicy} onChange={(event) => setField("transferReceiverPolicy", event.target.value)} /></label>
                <label className="field full"><span>Mint receiver policy ID</span><input placeholder="Leave empty for unrestricted" value={form.mintReceiverPolicy} onChange={(event) => setField("mintReceiverPolicy", event.target.value)} /></label>
              </div>
              <div className="pause-controls"><div><strong>Start with features paused</strong><p>Pause is applied last in the atomic launch sequence.</p></div><label><input type="checkbox" checked={form.pauseTransfer} onChange={(event) => setField("pauseTransfer", event.target.checked)} /><span>Transfers</span></label><label><input type="checkbox" checked={form.pauseMint} onChange={(event) => setField("pauseMint", event.target.checked)} /><span>Minting</span></label><label><input type="checkbox" checked={form.pauseBurn} onChange={(event) => setField("pauseBurn", event.target.checked)} /><span>Burning</span></label></div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="step-content">
              <div className="review-banner"><div className="review-icon"><Rocket size={24} /></div><div><span>Ready for final review</span><h2>{form.name} <b>{form.symbol}</b></h2><p>One atomic Base Mainnet transaction. Your wallet remains the only signer.</p></div></div>
              <div className="review-grid">
                <div className="review-block"><span>Deployment</span><div><small>Standard</small><strong>B20 {form.variant === "asset" ? "Asset" : "Stablecoin"}</strong></div><div><small>Network</small><strong>Base Mainnet / 8453</strong></div><div><small>Admin</small><strong>{shortAddress(admin)}</strong></div><div><small>Platform fee</small><strong>$0</strong></div></div>
                <div className="review-block"><span>Storage</span><div><small>Provider</small><strong>Lighthouse</strong></div><div><small>Logo CID</small><strong>{compactCid(prepared?.logo?.cid)}</strong></div><div><small>Metadata CID</small><strong>{compactCid(prepared?.contract.cid)}</strong></div><div><small>Status</small><strong className={storageReady ? "good" : "warn"}>{storageReady ? "Live & verified" : metadataReady ? "Staged until submission" : "Not ready"}</strong></div></div>
              </div>
              {quote ? <div className="transaction-card"><div className="transaction-head"><div><span>Unsigned transaction package</span><strong>{quote.predictedToken}</strong></div><span className="secure-badge"><KeyRound size={14} /> Non-custodial</span></div><div className="tx-metrics"><div><span>Router</span><strong>{shortAddress(transaction?.to)}</strong></div><div><span>Gas estimate</span><strong>{quote.gasEstimate ?? "RPC unavailable"}</strong></div><div><span>Transaction value</span><strong>0 ETH</strong></div></div><details><summary><Clipboard size={14} /> Inspect transaction calldata</summary><pre>{transaction?.attributedData}</pre></details></div> : <div className="build-prompt"><Network size={25} /><div><strong>Build the final transaction</strong><p>Every field is validated before the deterministic token address and unsigned transaction are prepared.</p></div></div>}
              {quote?.warnings.map((warning) => <div className="notice warning" key={warning}><AlertTriangle size={17} /><span>{warning}</span></div>)}
              {hash ? <a className="tx-link" href={`https://basescan.org/tx/${hash}`} target="_blank" rel="noreferrer"><CheckCircle2 size={18} /><span><strong>Transaction submitted</strong><small>{hash}</small></span><ExternalLink size={16} /></a> : null}
              {hash && !storageReady ? <button className="button secondary retry-publish" onClick={handleCommitRetry} disabled={busy === "commit"}><UploadCloud size={15} />{busy === "commit" ? "Publishing metadata" : "Retry metadata publication"}</button> : null}
            </div>
          ) : null}

          <footer className="workbench-actions">
            <div className="action-secondary-group">
              <button className="button secondary back-action" aria-label="Back" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}><ArrowLeft size={16} /><span>Back</span></button>
              <button className="button secondary preview-trigger" aria-label="Preview" type="button" onClick={() => setPreviewOpen(true)}><Eye size={16} /><span>Preview</span></button>
            </div>
            <div>
              {step === 0 ? <button className="button primary" onClick={handlePrepareMetadata} disabled={!identityReady || busy === "metadata"}><UploadCloud size={16} />{busy === "metadata" ? "Preparing metadata" : metadataReady ? "Restage metadata" : "Prepare secure metadata"}</button> : null}
              {step > 0 && step < 2 ? <button className="button primary" onClick={handleEconomicsContinue} disabled={Boolean(economicsIssue)}>Continue <ArrowRight size={16} /></button> : null}
              {step === 2 ? <button className="button primary" onClick={handleQuote} disabled={busy === "quote" || !metadataReady}><Zap size={16} />{busy === "quote" ? "Building transaction" : "Build launch transaction"}</button> : null}
              {step === 3 && !quote ? <button className="button primary" onClick={handleQuote} disabled={busy === "quote" || !metadataReady}><Zap size={16} />{busy === "quote" ? "Building transaction" : "Build transaction"}</button> : null}
              {step === 3 && quote && !hash ? <button className="button primary launch" onClick={handleSend} disabled={busy === "send"}><Rocket size={16} />{busy === "send" ? "Confirm in wallet" : "Sign & launch on Base"}</button> : null}
            </div>
          </footer>
        </section>

        <aside className="token-preview"><TokenPreviewContent model={previewModel} onCopy={copy} /></aside>
      </div>
      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)}><TokenPreviewContent model={previewModel} onCopy={copy} /></PreviewDialog>
      <CapabilitiesBand />
      <SiteFooter />
    </main>
  );
}
