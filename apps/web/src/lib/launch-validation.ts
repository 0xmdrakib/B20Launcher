const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type UnsignedTransactionCheck = {
  chainId: number;
  to: string;
  value: string;
  data?: string;
  attributedData?: string;
  expiresAt?: string;
};

export function validateUnsignedLaunchTransaction(
  transaction: UnsignedTransactionCheck,
  input: { expectedChainId: number; quoteFingerprint: string; currentFingerprint: string; now?: number }
) {
  if (transaction.chainId !== input.expectedChainId) return "The transaction targets the wrong network.";
  if (!transaction.to || transaction.to.toLowerCase() === ZERO_ADDRESS) return "The launch router is not configured.";
  if (transaction.value !== "0") return "Launch transactions must have zero native value.";
  if (!transaction.data || transaction.data.length <= 2 || !transaction.attributedData || transaction.attributedData.length <= 2) return "Transaction calldata is missing.";
  if (input.quoteFingerprint !== input.currentFingerprint) return "The transaction does not match the current form.";
  const expiry = transaction.expiresAt ? Date.parse(transaction.expiresAt) : NaN;
  if (!Number.isFinite(expiry) || expiry <= (input.now ?? Date.now())) return "The transaction quote has expired.";
  return null;
}

