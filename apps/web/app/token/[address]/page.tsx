import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError, ensureStoreReady, getPublicToken } from "@base-b20/api/core";
import { isAddress } from "viem";
import { AddTokenToWallet } from "../../../src/components/AddTokenToWallet";

export const dynamic = "force-dynamic";

const loadToken = cache(async (address: string) => {
  if (!isAddress(address, { strict: false })) notFound();
  await ensureStoreReady();
  try { return await getPublicToken(address); }
  catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const token = await loadToken((await params).address);
  const title = `${token.name} (${token.symbol}) | B20 Launcher`;
  const path = `/token/${token.address}`;
  return {
    title, description: token.description,
    alternates: { canonical: path },
    openGraph: { title, description: token.description, url: path, images: [{ url: token.logoURI, width: 512, height: 512, alt: `${token.name} logo` }] },
    twitter: { card: "summary", title, description: token.description, images: [token.logoURI] }
  };
}

export default async function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const token = await loadToken((await params).address);
  const website = token.website && /^https?:\/\//i.test(token.website) ? token.website : null;
  return <main className="public-token-page">
    <a className="public-token-back" href="/">B20 Launcher</a>
    <article className="public-token-card">
      <div className="public-token-heading">
        {/* The image has already been normalized and verified during publication. */}
        <img src={`/api/tokens/${token.address}/logo`} width={96} height={96} alt={`${token.name} logo`} />
        <div><p className="public-token-network">BASE MAINNET</p><h1>{token.name}</h1><p>{token.symbol}</p></div>
      </div>
      {token.description ? <p className="public-token-description">{token.description}</p> : null}
      <dl className="public-token-details">
        <div><dt>Token address</dt><dd><a href={`https://basescan.org/token/${token.address}`} target="_blank" rel="noopener noreferrer">{token.address}</a></dd></div>
        <div><dt>Decimals</dt><dd>{token.decimals}</dd></div>
        <div><dt>Standard</dt><dd>B20 {token.variant === "asset" ? "Asset" : "Stablecoin"}</dd></div>
      </dl>
      <div className="published-token-actions">
        <AddTokenToWallet token={token} />
        <a className="button secondary" href={`https://basescan.org/token/${token.address}`} target="_blank" rel="noopener noreferrer">View on BaseScan</a>
        {website ? <a className="button secondary" href={website} target="_blank" rel="noopener noreferrer">Website</a> : null}
      </div>
    </article>
  </main>;
}
