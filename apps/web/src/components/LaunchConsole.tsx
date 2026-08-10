"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  Copy,
  Eye,
  ExternalLink,
  FileImage,
  KeyRound,
  Layers3,
  Network,
  Rocket,
  RotateCcw,
  UploadCloud,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { formatUnits, getAddress, isAddress, parseUnits, type Address, type Hex } from "viem";
import { base } from "wagmi/chains";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient
} from "wagmi";

import { ZERO_ADDRESS, type LaunchDraftInput, type UnsignedLaunchTransaction } from "@base-b20/b20";

import { API_URL, commitMetadata, prepareMetadata, quoteLaunch, type PreparedMetadataResponse, type QuoteResponse } from "../lib/api";
import {
  initialWorkflowState,
  launchWorkflowReducer,
  stepStatuses,
  tokenLifecycleStatus
} from "../lib/launch-workflow";
import { validateUnsignedLaunchTransaction } from "../lib/launch-validation";
import {
  AppHeader,
  ConfirmDialog,
  PreviewDialog,
  ProgressNav,
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

function sanitizeDraft(value: unknown): Partial<typeof initialForm> {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const result: Partial<typeof initialForm> = {};
  (Object.keys(initialForm) as Array<keyof typeof initialForm>).forEach((key) => {
    const candidate = source[key];
    if (typeof candidate !== typeof initialForm[key]) return;
    if (key === "variant" && candidate !== "asset" && candidate !== "stablecoin") return;
    result[key] = candidate as never;
  });
  return result;
}

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

const MAX_POLICY_ID = (1n << 64n) - 1n;
function validPolicyId(value: string) {
  if (!/^\d+$/.test(value.trim())) return false;
  try { return BigInt(value.trim()) <= MAX_POLICY_ID; } catch { return false; }
}

function displayAmount(value: string) {
  const [whole = "0", fraction] = value.split(".");
  const grouped = /^\d+$/.test(whole) ? BigInt(whole || "0").toLocaleString("en-US") : value;
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Request aborted", "AbortError"));
    }, { once: true });
  });
}

export function LaunchConsole() {
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(0);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [prepared, setPrepared] = useState<PreparedMetadataResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteFingerprint, setQuoteFingerprint] = useState("");
  const [hash, setHash] = useState("");
  const [receiptConfirmed, setReceiptConfirmed] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [workflow, dispatchWorkflow] = useReducer(launchWorkflowReducer, initialWorkflowState);
  const [notice, setNotice] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [mintAmountManuallyEdited, setMintAmountManuallyEdited] = useState(false);
  const requestControllers = useRef<Set<AbortController>>(new Set());
  const epochRef = useRef(initialWorkflowState.epoch);

  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: base.id });

  const phase = workflow.phase;
  const busy = phase === "stagingMetadata" || phase === "buildingTransaction" || phase === "awaitingWallet" || phase === "confirming" || phase === "publishingMetadata";
  const error = workflow.error ?? "";
  const success = notice;

  useEffect(() => {
    epochRef.current = workflow.epoch;
  }, [workflow.epoch]);

  function setError(message: string) {
    if (message) dispatchWorkflow({ type: "ERROR", error: message });
    else dispatchWorkflow({ type: "CLEAR_ERROR" });
    if (message) setNotice("");
  }

  function setSuccess(message: string) {
    dispatchWorkflow({ type: "CLEAR_ERROR" });
    setNotice(message);
  }

  async function copyValue(value: string) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopyMessage("Copied to clipboard");
    } catch {
      setCopyMessage("Copy failed — select the value manually");
    }
    window.setTimeout(() => setCopyMessage(""), 2_000);
  }

  function requestController() {
    const controller = new AbortController();
    requestControllers.current.add(controller);
    return controller;
  }

  function releaseController(controller: AbortController) {
    requestControllers.current.delete(controller);
  }

  function isCurrentEpoch(epoch: number) {
    return epochRef.current === epoch;
  }

  useEffect(() => () => {
    requestControllers.current.forEach((controller) => controller.abort());
    requestControllers.current.clear();
  }, []);

  useEffect(() => {
    const handleFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(".workbench input, .workbench textarea, .workbench select")) return;
      target.scrollIntoView({ block: "center", behavior: "auto" });
    };
    document.addEventListener("focusin", handleFocus);
    return () => document.removeEventListener("focusin", handleFocus);
  }, []);

  useEffect(() => {
    const handleScroll = () => setHasScrolled(window.scrollY > 16);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(DRAFT_KEY) ??
        PREVIOUS_DRAFT_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
      if (saved) {
        const parsed = sanitizeDraft(JSON.parse(saved));
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
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
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
  const controlReady = [form.minter, form.metadataAdmin, form.pauser, form.burner, form.operator].every((value) => !value.trim() || isAddress(value)) &&
    [form.transferSenderPolicy, form.transferReceiverPolicy, form.mintReceiverPolicy].every((value) => !value.trim() || validPolicyId(value));
  const completedSteps = [metadataReady, economicsReady && admin !== ZERO_ADDRESS, controlReady, Boolean(quote)];
  const statuses = stepStatuses(step, completedSteps);
  const previewImage = logoPreview || prepared?.logo?.gatewayUrls[0];

  const fieldErrors = useMemo<Partial<Record<FieldKey, string>>>(() => {
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!form.name.trim()) errors.name = "Token name is required.";
    if (!form.symbol.trim()) errors.symbol = "Symbol is required.";
    if (!form.description.trim()) errors.description = "Description is required.";
    if (form.description.length > 2000) errors.description = "Description must be 2,000 characters or fewer.";
    if (!logo) errors.logo = "Choose a PNG, JPEG or WebP logo up to 1 MB.";
    if (form.externalLink.trim() && !/^https:\/\//i.test(form.externalLink.trim())) errors.externalLink = "Use a secure https:// project URL.";
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
    for (const key of ["transferSenderPolicy", "transferReceiverPolicy", "mintReceiverPolicy"] as const) {
      if (form[key].trim() && !validPolicyId(form[key])) errors[key] = "Use a uint64 policy ID or leave empty.";
    }
    return errors;
  }, [address, form, logo, mintAmountUnits, supplyCapUnits, tokenDecimals]);

  function touch(...keys: FieldKey[]) {
    setTouched((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, true])) }));
  }

  function visibleFieldError(key: FieldKey) {
    return touched[key] ? fieldErrors[key] : undefined;
  }

  function focusFirstInvalid() {
    window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      element?.scrollIntoView({ block: "center", behavior: "auto" });
      element?.focus({ preventScroll: true });
    });
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

  function invalidatePreparedAndQuote() {
    requestControllers.current.forEach((controller) => controller.abort());
    requestControllers.current.clear();
    dispatchWorkflow({ type: "EDIT" });
    setQuote(null);
    setQuoteFingerprint("");
    setHash("");
    setReceiptConfirmed(false);
    setNotice("");
    setCopyMessage("");
  }

  function setField<K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    invalidatePreparedAndQuote();
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
    invalidatePreparedAndQuote();
    setError("");
    setSuccess("");
  }

  function selectLogo(file: File | null) {
    touch("logo");
    if (file && file.size > 1_000_000) {
      setLogo(null);
      setPrepared(null);
      invalidatePreparedAndQuote();
      setError("Logo must be 1 MB or smaller.");
      return;
    }
    setLogo(file);
    setPrepared(null);
    invalidatePreparedAndQuote();
    setError("");
  }

  function resetDraft() {
    requestControllers.current.forEach((controller) => controller.abort());
    requestControllers.current.clear();
    dispatchWorkflow({ type: "RESET" });
    setForm(initialForm);
    setStep(0);
    setLogo(null);
    setPrepared(null);
    setQuote(null);
    setQuoteFingerprint("");
    setHash("");
    setReceiptConfirmed(false);
    setNotice("");
    setTouched({});
    setMintAmountManuallyEdited(false);
    window.localStorage.removeItem(DRAFT_KEY);
    PREVIOUS_DRAFT_KEYS.forEach((key) => window.localStorage.removeItem(key));
  }

  function requestResetDraft() {
    setResetOpen(true);
  }

  async function handlePrepareMetadata() {
    if (!identityReady || fieldErrors.externalLink) {
      touch("name", "symbol", "description", "logo");
      setError(fieldErrors.externalLink ?? "Complete the identity fields and choose a logo first.");
      focusFirstInvalid();
      return;
    }
    const epoch = workflow.epoch;
    const controller = requestController();
    dispatchWorkflow({ type: "STAGE_METADATA" });
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
      const result = await prepareMetadata(body, { signal: controller.signal });
      if (!isCurrentEpoch(epoch)) return;
      setPrepared(result);
      dispatchWorkflow({ type: "METADATA_STAGED" });
      setSuccess("Metadata is staged with deterministic CIDs. Lighthouse publication happens only after launch submission.");
      setStep(1);
    } catch (err) {
      if (controller.signal.aborted || !isCurrentEpoch(epoch)) return;
      setError(err instanceof Error ? err.message : "Could not stage token metadata.");
    } finally {
      releaseController(controller);
    }
  }

  function getEconomicsError(): string {
    if (form.admin.trim() && !isAddress(form.admin)) return "Admin wallet must be a valid Base address.";
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
      focusFirstInvalid();
      return;
    }
    setError("");
    setStep(2);
  }

  async function handleQuote() {
    if (!metadataReady) {
      setError("Stage token metadata before building the transaction.");
      setStep(0);
      touch("name", "symbol", "description", "logo");
      focusFirstInvalid();
      return;
    }
    const economicsIssue = getEconomicsError();
    if (economicsIssue) {
      setError(economicsIssue);
      setStep(1);
      focusFirstInvalid();
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
      focusFirstInvalid();
      return;
    }
    const invalidPolicy = [
      ["Sender policy", form.transferSenderPolicy],
      ["Receiver policy", form.transferReceiverPolicy],
      ["Mint receiver policy", form.mintReceiverPolicy]
    ] as const;
    const invalidPolicyField = invalidPolicy.find(([, value]) => value.trim() && !validPolicyId(value));
    if (invalidPolicyField) {
      touch("transferSenderPolicy", "transferReceiverPolicy", "mintReceiverPolicy");
      setError(`${invalidPolicyField[0]} must be a uint64 policy ID or left empty.`);
      setStep(2);
      focusFirstInvalid();
      return;
    }
    const epoch = workflow.epoch;
    const controller = requestController();
    dispatchWorkflow({ type: "BUILD_TRANSACTION" });
    setError("");
    setSuccess("");
    try {
      if (!prepared?.stageToken) throw new Error("Secure metadata stage token is missing. Prepare metadata again.");
      const result = await quoteLaunch(launchPayload, prepared.stageId, prepared.stageToken, { signal: controller.signal });
      if (!isCurrentEpoch(epoch)) return;
      setQuote(result);
      setQuoteFingerprint(JSON.stringify(launchPayload));
      dispatchWorkflow({ type: "TRANSACTION_READY" });
      setStep(3);
      setSuccess("Unsigned launch transaction is ready for final review.");
    } catch (err) {
      if (controller.signal.aborted || !isCurrentEpoch(epoch)) return;
      setError(err instanceof Error ? err.message : "Could not build launch transaction.");
    } finally {
      releaseController(controller);
    }
  }

  async function handleSend() {
    if (!quote) return;
    if (!walletClient || !address) {
      setError("Connect a wallet before signing the launch.");
      return;
    }
    const transaction = quote.transaction;
    const currentFingerprint = JSON.stringify(launchPayload);
    const transactionIssue = validateUnsignedLaunchTransaction(transaction, {
      expectedChainId: 8453,
      quoteFingerprint,
      currentFingerprint
    });
    if (transactionIssue || !routerIsConfigured) {
      setError(transactionIssue ?? "The launch router is not configured for Base Mainnet.");
      return;
    }

    if (!publicClient) {
      setError("Base Mainnet RPC is unavailable. Try again in a moment.");
      return;
    }
    const epoch = workflow.epoch;
    const controller = requestController();
    dispatchWorkflow({ type: "AWAIT_WALLET" });
    setError("");
    setSuccess("");
    try {
      if (chainId !== transaction.chainId) await switchChainAsync({ chainId: transaction.chainId });
      const txHash = await walletClient.sendTransaction({
        account: address,
        chain: base,
        to: transaction.to as Address,
        data: transaction.attributedData as Hex,
        value: 0n
      });
      if (!isCurrentEpoch(epoch)) return;
      setHash(txHash);
      setReceiptConfirmed(false);
      dispatchWorkflow({ type: "SUBMITTED", txHash });
      setSuccess("Transaction submitted to Base Mainnet. Waiting for a successful receipt.");
      dispatchWorkflow({ type: "CONFIRMING" });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 120_000 });
      if (!isCurrentEpoch(epoch)) return;
      if (receipt.status !== "success") {
        throw new Error("The Base transaction reverted. Nothing was published to Lighthouse.");
      }
      setReceiptConfirmed(true);
      if (!prepared?.stageToken) throw new Error("Metadata stage is missing. Re-prepare metadata before retrying.");
      dispatchWorkflow({ type: "PUBLISH_METADATA", retryAttempt: 0 });
      let committed: PreparedMetadataResponse | null = null;
      let lastCommitError: unknown;
      for (const [attempt, delayMs] of [0, 2_000, 5_000, 10_000].entries()) {
        if (delayMs) await abortableDelay(delayMs, controller.signal);
        if (attempt) dispatchWorkflow({ type: "PUBLISH_METADATA", retryAttempt: attempt });
        try {
          committed = await commitMetadata({
            stageId: prepared.stageId,
            stageToken: prepared.stageToken,
            idempotencyKey: transaction.idempotencyKey,
            txHash
          }, { signal: controller.signal });
          break;
        } catch (commitError) {
          lastCommitError = commitError;
          if (controller.signal.aborted) throw commitError;
        }
      }
      if (!committed) throw lastCommitError instanceof Error ? lastCommitError : new Error("Metadata publication needs a manual retry.");
      if (!isCurrentEpoch(epoch)) return;
      setPrepared(committed);
      dispatchWorkflow({ type: "COMPLETE" });
      setSuccess("Launch confirmed on Base Mainnet and metadata is live through Lighthouse.");
    } catch (err) {
      if (controller.signal.aborted || !isCurrentEpoch(epoch)) return;
      const code = typeof err === "object" && err && "code" in err ? (err as { code?: number }).code : undefined;
      const message = err instanceof Error ? err.message : "";
      const timedOut = /timeout|timed out/i.test(message);
      setError(code === 4001 ? "Wallet signing was cancelled. Your draft is unchanged." : timedOut ? "The transaction was submitted, but Base receipt confirmation timed out. Metadata was not published." : message || "Transaction confirmation or metadata publication failed. You can retry safely.");
    } finally {
      releaseController(controller);
    }
  }

  async function handleCommitRetry() {
    if (!hash || !receiptConfirmed || !quote || !prepared) return;
    const controller = requestController();
    const epoch = workflow.epoch;
    dispatchWorkflow({ type: "PUBLISH_METADATA", retryAttempt: workflow.retryAttempt + 1 });
    setError("");
    try {
      const committed = await commitMetadata({
        stageId: prepared.stageId,
        stageToken: prepared.stageToken ?? "",
        idempotencyKey: quote.transaction.idempotencyKey,
        txHash: hash
      }, { signal: controller.signal });
      if (!isCurrentEpoch(epoch)) return;
      setPrepared(committed);
      dispatchWorkflow({ type: "COMPLETE" });
      setSuccess("Metadata is live and verified through Lighthouse.");
    } catch (err) {
      if (controller.signal.aborted || !isCurrentEpoch(epoch)) return;
      setError(err instanceof Error ? err.message : "Metadata publication could not be completed.");
    } finally {
      releaseController(controller);
    }
  }

  async function handleReceiptRetry() {
    if (!hash || receiptConfirmed || !publicClient) return;
    const controller = requestController();
    const epoch = workflow.epoch;
    dispatchWorkflow({ type: "CONFIRMING" });
    setError("");
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hex, confirmations: 1, timeout: 120_000 });
      if (!isCurrentEpoch(epoch)) return;
      if (receipt.status !== "success") throw new Error("The submitted Base transaction reverted. Metadata was not published.");
      setReceiptConfirmed(true);
      dispatchWorkflow({ type: "SUBMITTED", txHash: hash });
      setSuccess("Base receipt confirmed. Retry metadata publication when ready.");
    } catch (err) {
      if (controller.signal.aborted || !isCurrentEpoch(epoch)) return;
      setError(err instanceof Error ? err.message : "Receipt confirmation failed. Try again later.");
    } finally {
      releaseController(controller);
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
    lifecycleStatus: tokenLifecycleStatus({
      metadataReady,
      transactionReady: Boolean(quote),
      submitted: Boolean(hash),
      complete: phase === "complete" && storageReady
    }),
    readiness: [
      { label: storageReady ? "Metadata live" : "Metadata staged", done: metadataReady },
      { label: "Supply configured", done: economicsReady },
      { label: "Admin wallet", done: admin !== ZERO_ADDRESS },
      { label: "Transaction built", done: Boolean(quote) }
    ],
    ...(quote?.predictedToken ? { predictedToken: quote.predictedToken } : {})
  };

  return (
    <main className="app-shell" id="top" data-ready={draftReady ? "true" : "false"}>
      <AppHeader
        apiUrl={API_URL}
        walletControl={
          <>
            <button className="icon-button reset-action reset-action-mobile" onClick={requestResetDraft} title="Start a new launch" aria-label="Start a new launch and clear the current draft"><RotateCcw size={17} /><span>New launch</span></button>
            <button className="button reset-action reset-action-desktop" onClick={requestResetDraft} title="Start a new launch" aria-label="Start a new launch and clear the current draft"><RotateCcw size={17} /><span>New launch</span></button>
            <WalletControl />
          </>
        }
      />

      <section className="launch-guide" aria-label="What B20 Launcher is for">
        <div className="launch-guide-copy">
          <span className="eyebrow">What this is</span>
          <p><strong>Launch a B20 asset or stablecoin on Base.</strong> Set its identity, supply and controls, then approve one transaction in your wallet.</p>
        </div>
      </section>

      <div className="launch-layout">
        <ProgressNav steps={steps} current={step} statuses={statuses} onSelect={setStep} />

        <section className="workbench" onFocusCapture={(event) => {
          const target = event.target;
          if (target instanceof HTMLElement && target.matches("input, textarea, select")) target.scrollIntoView({ block: "center", behavior: "auto" });
        }}>
          <div className="workbench-head">
            <div><span className="eyebrow">Step {step + 1} of 4</span><h1>{currentStep.label}</h1><p>{currentStep.detail}</p></div>
            <span className="variant-chip">{form.variant === "asset" ? "B20 Asset" : "B20 Stablecoin"}</span>
          </div>

          {error ? <div className="notice error" role="alert"><AlertTriangle size={17} aria-hidden="true" /><span>{error}</span></div> : null}
          {success ? <div className="notice success" role="status" aria-live="polite"><CheckCircle2 size={17} aria-hidden="true" /><span>{success}</span></div> : null}
          {copyMessage ? <div className="copy-feedback" role="status" aria-live="polite"><Copy size={14} aria-hidden="true" />{copyMessage}</div> : null}

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
                    {previewImage ? <img src={previewImage} alt="Token logo preview" width="68" height="68" /> : <span className="logo-placeholder"><UploadCloud size={26} /><strong>Upload logo</strong><small>PNG, JPEG or WebP</small><small className="logo-limit">Maximum 1 MB</small></span>}
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
              {prepared ? <div className="cid-grid"><div><span>Logo CID</span><strong>{compactCid(prepared.logo?.cid)}</strong><button onClick={() => prepared.logo && void copyValue(prepared.logo.cid)} title="Copy logo CID" aria-label="Copy logo CID"><Copy size={14} /></button></div><div><span>Contract metadata CID</span><strong>{compactCid(prepared.contract.cid)}</strong><button onClick={() => void copyValue(prepared.contract.cid)} title="Copy metadata CID" aria-label="Copy metadata CID"><Copy size={14} /></button></div></div> : null}
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
                {form.variant === "asset" ? <details className="advanced-disclosure field full"><summary><span><strong>Advanced asset metadata</strong><small>Optional key/value metadata for integrations.</small></span><ArrowRight size={16} aria-hidden="true" /></summary><label className="field"><span>Asset classification</span><div className="field-pair"><input aria-label="Asset metadata key" value={form.extraKey} onChange={(event) => setField("extraKey", event.target.value)} /><input aria-label="Asset metadata value" value={form.extraValue} onChange={(event) => setField("extraValue", event.target.value)} /></div></label></details> : null}
              </div>
              <details className="advanced-disclosure">
                <summary><span><strong>Advanced policy registry</strong><small>Optional numeric IDs for controlled transfers and minting.</small></span><ArrowRight size={16} aria-hidden="true" /></summary>
                <div className="form-grid policy-grid">
                  <label className="field"><span>Sender policy ID</span><input placeholder="Leave empty for unrestricted" value={form.transferSenderPolicy} aria-invalid={Boolean(visibleFieldError("transferSenderPolicy"))} onBlur={() => touch("transferSenderPolicy")} onChange={(event) => setField("transferSenderPolicy", event.target.value)} />{visibleFieldError("transferSenderPolicy") ? <small className="field-error">{visibleFieldError("transferSenderPolicy")}</small> : null}</label>
                  <label className="field"><span>Receiver policy ID</span><input placeholder="Leave empty for unrestricted" value={form.transferReceiverPolicy} aria-invalid={Boolean(visibleFieldError("transferReceiverPolicy"))} onBlur={() => touch("transferReceiverPolicy")} onChange={(event) => setField("transferReceiverPolicy", event.target.value)} />{visibleFieldError("transferReceiverPolicy") ? <small className="field-error">{visibleFieldError("transferReceiverPolicy")}</small> : null}</label>
                  <label className="field full"><span>Mint receiver policy ID</span><input placeholder="Leave empty for unrestricted" value={form.mintReceiverPolicy} aria-invalid={Boolean(visibleFieldError("mintReceiverPolicy"))} onBlur={() => touch("mintReceiverPolicy")} onChange={(event) => setField("mintReceiverPolicy", event.target.value)} />{visibleFieldError("mintReceiverPolicy") ? <small className="field-error">{visibleFieldError("mintReceiverPolicy")}</small> : null}</label>
                </div>
              </details>
              <div className="pause-controls"><div><strong>Start with features paused</strong><p>Pause is applied last in the atomic launch sequence.</p></div><label><input type="checkbox" checked={form.pauseTransfer} onChange={(event) => setField("pauseTransfer", event.target.checked)} /><span>Transfers</span></label><label><input type="checkbox" checked={form.pauseMint} onChange={(event) => setField("pauseMint", event.target.checked)} /><span>Minting</span></label><label><input type="checkbox" checked={form.pauseBurn} onChange={(event) => setField("pauseBurn", event.target.checked)} /><span>Burning</span></label></div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="step-content">
              <div className="review-banner"><div className="review-icon"><Rocket size={24} /></div><div><span>{quote ? "Ready for final review" : "Review required fields"}</span><h2>{form.name || "Untitled token"} <b>{form.symbol || "SYMBOL"}</b></h2><p>{quote ? "One atomic Base Mainnet transaction. Your wallet remains the only signer." : "Complete the required fields, then build an unsigned transaction for your wallet to inspect."}</p></div></div>
              <div className="review-grid">
                <div className="review-block"><span>Deployment</span><div><small>Standard</small><strong>B20 {form.variant === "asset" ? "Asset" : "Stablecoin"}</strong></div><div><small>Network</small><strong>Base Mainnet / 8453</strong></div><div><small>Admin</small><strong>{shortAddress(admin)}</strong></div><div><small>Platform fee</small><strong>$0</strong></div></div>
                <div className="review-block"><span>Storage</span><div><small>Provider</small><strong>Lighthouse</strong></div><div><small>Logo CID</small><strong>{compactCid(prepared?.logo?.cid)}</strong></div><div><small>Metadata CID</small><strong>{compactCid(prepared?.contract.cid)}</strong></div><div><small>Status</small><strong className={storageReady ? "good" : "warn"}>{storageReady ? "Live & verified" : receiptConfirmed ? "Receipt confirmed — publish pending" : metadataReady ? "Staged until submission" : "Not ready"}</strong></div></div>
              </div>
              {quote ? <div className="transaction-card"><div className="transaction-head"><div><span>Unsigned transaction package</span><strong>{quote.predictedToken}</strong></div><span className="secure-badge"><KeyRound size={14} /> Non-custodial</span></div><div className="tx-metrics"><div><span>Router</span><strong>{shortAddress(transaction?.to)}</strong></div><div><span>Gas estimate</span><strong>{quote.gasEstimate ?? "RPC unavailable"}</strong></div><div><span>Transaction value</span><strong>0 ETH</strong></div></div><details><summary><Clipboard size={14} /> Inspect transaction calldata</summary><pre>{transaction?.attributedData}</pre></details></div> : <div className="build-prompt"><Network size={25} /><div><strong>Build the final transaction</strong><p>Every field is validated before the deterministic token address and unsigned transaction are prepared.</p></div></div>}
              {quote?.warnings.map((warning) => <div className="notice warning" key={warning}><AlertTriangle size={17} /><span>{warning}</span></div>)}
              {hash ? <a className="tx-link" href={`https://basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer"><CheckCircle2 size={18} /><span><strong>{receiptConfirmed ? "Transaction confirmed" : "Transaction submitted"}</strong><small>{hash}</small></span><ExternalLink size={16} /></a> : null}
              {hash && !receiptConfirmed ? <button className="button secondary retry-publish" onClick={handleReceiptRetry} disabled={phase === "confirming"}><Network size={15} />{phase === "confirming" ? "Checking Base receipt" : "Check Base receipt"}</button> : null}
              {hash && receiptConfirmed && !storageReady ? <button className="button secondary retry-publish" onClick={handleCommitRetry} disabled={phase === "publishingMetadata"}><UploadCloud size={15} />{phase === "publishingMetadata" ? "Publishing metadata" : "Retry metadata publication"}</button> : null}
            </div>
          ) : null}

          <footer className={`workbench-actions ${hasScrolled ? "is-sticky" : ""}`}>
            <div className="action-secondary-group">
              <button className="button secondary back-action" aria-label="Back" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}><ArrowLeft size={16} /><span>Back</span></button>
              <button className="button secondary preview-trigger" aria-label="Preview" type="button" onClick={() => setPreviewOpen(true)}><Eye size={16} /><span>Preview</span></button>
            </div>
            <div>
              {step === 0 ? <button className="button primary" onClick={handlePrepareMetadata} disabled={phase === "stagingMetadata"}><UploadCloud size={16} />{phase === "stagingMetadata" ? "Preparing metadata" : metadataReady ? "Restage metadata" : "Prepare secure metadata"}</button> : null}
              {step > 0 && step < 2 ? <button className="button primary" onClick={handleEconomicsContinue} disabled={busy}>Continue <ArrowRight size={16} /></button> : null}
              {step === 2 ? <button className="button primary" onClick={handleQuote} disabled={phase === "buildingTransaction"}><Zap size={16} />{phase === "buildingTransaction" ? "Building transaction" : "Build launch transaction"}</button> : null}
              {step === 3 && !quote ? <button className="button primary" onClick={handleQuote} disabled={phase === "buildingTransaction"}><Zap size={16} />{phase === "buildingTransaction" ? "Building transaction" : "Build transaction"}</button> : null}
              {step === 3 && quote && !hash ? <button className="button primary launch" onClick={handleSend} disabled={busy}><Rocket size={16} />{phase === "awaitingWallet" ? "Confirm in wallet" : phase === "confirming" ? "Confirming on Base" : phase === "publishingMetadata" ? "Publishing metadata" : "Sign & launch on Base"}</button> : null}
            </div>
          </footer>
        </section>

        <aside className="token-preview"><TokenPreviewContent model={previewModel} onCopy={copyValue} /></aside>
      </div>
      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)}><TokenPreviewContent model={previewModel} onCopy={copyValue} /></PreviewDialog>
      <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={() => { resetDraft(); setResetOpen(false); }} />
    </main>
  );
}
