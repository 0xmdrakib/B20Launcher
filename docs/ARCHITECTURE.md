# Architecture

Public wallet, explorer, and indexer endpoints are documented in [Token integrations](token-integrations.md). They project confirmed, published launches from the existing store; private staging records never cross the public API boundary.

## Runtime Surfaces

- `apps/web`: Next.js issuer console for metadata, role setup, launch preview, wallet signing, and operations visibility.
- `apps/api`: Framework-neutral server core plus an Express compatibility adapter for IPFS metadata preparation, launch quote/build, status, and generic x402 facilitator integration.
- `apps/web/app/api` and `apps/web/app/x402`: Primary same-origin Next.js Route Handlers used by the Vercel deployment, including x402 payment protection.
- `packages/b20`: Shared source of truth for schemas, ABI, B20 address derivation, Builder Code suffixing, and unsigned transaction packages.
- `packages/contracts`: `B20LaunchRouter`, a fee-free route into Base's native `B20Factory`.

## Launch Flow

1. User configures token details, logo, variant, admin, roles, supply cap, minting, and policy IDs.
2. API validates and normalizes the logo, computes deterministic logo and ERC-7572 metadata CIDs, and stages the exact bytes in Neon for 30 minutes without publishing them to IPFS. A random 256-bit stage token is returned once and only its SHA-256 hash is stored.
3. API requires the matching stage ID and private stage token, then builds a normalized launch payload and encodes a router call.
4. Router calls `B20Factory.createB20` with ordered init calls:
   - `updateContractURI`
   - `updateSupplyCap`
   - role grants
   - asset extra metadata and multiplier
   - initial mint or batch mint
   - policies
   - pause last
5. Wallet signs and submits attributed calldata. Backend never stores keys or submits the transaction.
6. The client sends the transaction hash and private stage credentials to the metadata commit endpoint. The API verifies the router target, exact calldata, and successful Base receipt before it calls Lighthouse.
7. Lighthouse CIDs must exactly match the locally predicted CIDs and the primary gateway must respond. Neon then removes the raw logo/JSON bytes immediately and retains a minimal committed audit record.

## Storage Lifecycle

- The Lighthouse API key exists only in the API process environment. Browser and agent responses never contain it.
- Metadata preparation cannot consume Lighthouse quota or create an IPFS/Filecoin object.
- Missing, stolen, or forged stage credentials cannot bind a launch transaction.
- Unconfirmed and reverted transactions cannot publish metadata.
- A five-minute cleanup worker deletes expired Neon stage rows. In production, `DATABASE_URL` is mandatory so pending stages survive API restarts.
- IPFS/Filecoin publication is intentionally permanent. Cleanup applies to temporary Neon data; published token metadata is retained because the onchain token references its CID.

## Agent Flow

`POST /x402/b20/build` is served by the same-origin Next.js Route Handler in production and returns:

```json
{
  "chainId": 8453,
  "to": "0xRouter",
  "value": "0",
  "data": "0x...",
  "attributedData": "0x...",
  "dataSuffix": "0x...",
  "predictedToken": "0x...",
  "expiresAt": "2026-...",
  "idempotencyKey": "8453:0xRouter:0xSalt"
}
```

The agent signs and submits with its own wallet.

## Issuer Console UX and Security

- The client uses a typed reducer (`apps/web/src/lib/launch-workflow.ts`) for metadata staging, transaction readiness, wallet submission, receipt confirmation, Lighthouse publication, and recoverable errors. Form edits increment an epoch, abort in-flight requests, and invalidate quotes; stage tokens and unsigned calldata remain memory-only.
- Desktop uses a 248px progress rail and focused workbench; smaller bands switch to a horizontal stepper and single-column flow. Preview is an accessible sheet, and its lifecycle is truthful (`Draft`, `Staged`, `Transaction ready`, `Submitted`, `Live`).
- The homepage is dynamically rendered so `apps/web/proxy.ts` can attach a per-request nonce CSP. Security headers include frame denial, restrictive permissions/referrer policy, popup-compatible COOP, and HSTS. Static trust/footer content is server-rendered; wallet and wizard interactions remain client islands.

## Production Checklist

- Deploy `B20LaunchRouter` with Base Foundry and verify on Basescan.
- Register `BASE_BUILDER_CODE` in Base dashboard and verify attribution on a Base Mainnet launch.
- Configure a server-only Lighthouse API key. `LIGHTHOUSE_GATEWAY_URL` is the HTTPS retrieval base ending in `/ipfs`; B20 uses `https://protective-walrus-h5noy.lighthouseweb3.xyz/ipfs` in Vercel Production and Preview. The authenticated upload endpoint remains `upload.lighthouse.storage`.
- The page's image security policy allows the configured gateway's exact origin and the shared Lighthouse gateway. Gateway credentials, query strings, fragments, and wildcard hosts are rejected; the API key never belongs in a retrieval URL. Redeploy after changing Vercel environment variables.
- Configure a pooled Neon Postgres `DATABASE_URL` and verify expiry cleanup in the deployment environment.
- Configure the Coinbase CDP x402 facilitator URL and server-only `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` credentials. Production uses Base Mainnet; x402 is disabled in every Vercel Preview deployment and never inherits production payment credentials.
- Run `pnpm build`, `pnpm test`, and `base-forge test -vvv`.
