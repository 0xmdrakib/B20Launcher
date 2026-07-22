# Architecture

## Runtime Surfaces

- `apps/web`: Next.js issuer console for metadata, role setup, launch preview, wallet signing, and operations visibility.
- `apps/api`: Express API for IPFS metadata preparation, launch quote/build, x402-protected agent build, status, and CDP SQL hooks.
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

`POST /x402/b20/build` returns:

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

## Production Checklist

- Deploy `B20LaunchRouter` with Base Foundry and verify on Basescan.
- Register `BASE_BUILDER_CODE` in Base dashboard and verify attribution on a Sepolia launch.
- Configure a Lighthouse API key and, when available, a dedicated Lighthouse gateway.
- Configure a pooled Neon Postgres `DATABASE_URL` and verify expiry cleanup in the deployment environment.
- Configure CDP SQL API and x402 CDP facilitator.
- Run `pnpm build`, `pnpm test`, and `base-forge test -vvv`.
- Dry run Base Sepolia launch with IPFS metadata and policy settings before Base Mainnet.
