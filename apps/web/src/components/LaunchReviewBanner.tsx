import { Rocket } from "lucide-react";

type ReviewStatus = "draft" | "ready" | "submitted" | "confirmed" | "complete";

const reviewCopy: Record<ReviewStatus, { label: string; description: string }> = {
  draft: {
    label: "Review required fields",
    description: "Complete the required fields, then build an unsigned transaction for your wallet to inspect."
  },
  ready: {
    label: "Ready for final review",
    description: "One atomic Base Mainnet transaction. Your wallet remains the only signer."
  },
  submitted: {
    label: "Launch submitted",
    description: "Waiting for your transaction to be confirmed on Base Mainnet."
  },
  confirmed: {
    label: "Transaction confirmed",
    description: "Your launch is confirmed. Finishing your token setup."
  },
  complete: {
    label: "Launch complete",
    description: "Your token is live on Base Mainnet."
  }
};

export function LaunchReviewBanner({ image, name, symbol, status }: {
  image?: string | undefined;
  name: string;
  symbol: string;
  status: ReviewStatus;
}) {
  const copy = reviewCopy[status];
  return (
    <div className="review-banner">
      <div className={`review-icon${image ? " has-logo" : ""}`}>
        {image
          ? <img src={image} alt={`${name || "Token"} logo`} width="52" height="52" />
          : <Rocket size={24} aria-hidden="true" />}
      </div>
      <div>
        <span>{copy.label}</span>
        <h2>{name || "Untitled token"} <b>{symbol || "SYMBOL"}</b></h2>
        <p>{copy.description}</p>
      </div>
    </div>
  );
}
