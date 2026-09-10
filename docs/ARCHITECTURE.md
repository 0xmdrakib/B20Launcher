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
5. Before sending a transaction, the wallet signs the publication challenge. It includes origin, chain, issuer, predicted address, router, calldata hash, stage ID, IPFS URIs, launch ID, and a ten-minute deadline. The server verifies the signature (including supported contract wallets), enforces durable upload budgets, locks the binding, and persists a discovery job before publishing.
6. Lighthouse must return the predicted CIDs. The API retrieves both files through the configured gateway, with fixed `ipfs.io` fallback, and verifies byte limits and SHA-256. Only a verified `ready` response permits the frontend to request the launch transaction. Backend never stores wallet keys or submits transactions.
7. The client reports the transaction hash; alternatively the server scans the known router's events from the prepublication block. Both paths verify exact router/calldata and a successful receipt before committing the public record. Raw stage bytes and the stage secret hash are removed on confirmation.

## Storage Lifecycle

- The Lighthouse API key exists only in the API process environment. Browser and agent responses never contain it.
- Metadata preparation cannot consume Lighthouse quota or create an IPFS/Filecoin object.
- Missing or forged stage credentials cannot bind a launch transaction. Stage credentials are bearer secrets and must remain private.
- Prepublication requires wallet approval and a bound launch. Unconfirmed or reverted launches are excluded from the address catalogue. New uploads explicitly use Lighthouse annual storage, whose file records can be deleted; confirmed token files remain pinned.
- Default publication budgets are 10 attempts per wallet and 100 per platform per UTC day. A durable admission limit of 200 unfinished publications stops accumulation if cleanup is unavailable. Signatures are authorization, not proof of a unique human. Each failed attempt consumes budget; automatic retries are bounded.
- New publications have a fixed 24-hour retention window, disclosed in the signed challenge. Retries do not extend it. After one additional hour of grace, discovery must scan through the safe head and verify `isB20Initialized` is false at both safe and latest heads before cleanup. RPC uncertainty or an initialized token preserves the files. Existing legacy stages keep their original expiry.
- Upload filenames contain the server-generated stage UUID. Cleanup deletes only matching filename/CID records in the annual account inventory, using their file IDs. Unrelated and legacy account files are not adopted. Shared committed-token, indexed-profile, or unrelated-account references preserve the CID; another unfinished launch postpones deletion. Legacy uploads without this ownership namespace require a separate inventory audit and are not automatically deleted.
- A cross-replica nonblocking advisory lock serializes paid uploads, receipt commitment and cleanup. A durable pending-cleanup fence prevents asset reuse after a crash; deletion attempts are journaled and inventory absence is verified before clearing private bytes and consuming the stage secret. A small audit tombstone is retained. Discovery can restore a confirmed launch while cleanup is still pending, reuploading staged bytes if necessary.
- Expiry maintenance removes only unpublished Neon stages. Publishing-stage evidence survives expiry and RPC/provider failures. Discovery jobs are bootstrapped from the saved prepublication block after a process exit; expired publication retry jobs are retired. In production, `DATABASE_URL` is mandatory.
- Cleanup removes our owned Lighthouse records, not copies already retrieved by other IPFS peers or gateways. The router has no onchain deadline: an independently saved raw transaction broadcast after the retention window is outside this upload guarantee. Official clients must respect quote/publication expiry and prepare a new launch after expiry.

The adapter follows Lighthouse's official [Delete File](https://docs.lighthouse.storage/lighthouse-1/how-to/delete-file) and [List Files](https://docs.lighthouse.storage/lighthouse-1/how-to/list-files) APIs. Permanent-plan files cannot be deleted through this API.

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

The agent calls `/api/metadata/publication-challenge`, signs the returned message, and sends the signature and deadline to `/api/metadata/publish`. It broadcasts with its own wallet only after the response reports `storage.status: "ready"` and `verified: true`. `/api/agents/manifest` describes the request fields. A quote alone is not proof that its IPFS files are public.

## Durable indexing

Postgres stores discovery/reconciliation jobs, leases, retry times, safe-block cursors, verified snapshots, and an append-only change feed. A five-minute lease protects each job; expired workers cannot overwrite newer snapshots or retire another worker's job. Change revision allocation and commit are serialized so consumers cannot skip a lower, uncommitted revision. Fingerprints canonicalize object keys because JSONB may reorder them.

The worker discovers armed launches at Base's safe head in bounded block ranges and advances a cursor only after a successful scan. Existing committed launches are backfilled in pages. Reconciliation checks the canonical launch receipt and native `isB20Initialized`, then reads current name, symbol, decimals and `contractURI` at one safe block. Changed profiles and raster images are size bounded and retrieved only through fixed IPFS gateways; unsupported external URL schemes retain the last verified snapshot and retry. An unchanged immutable URI reuses its verified content to avoid unnecessary gateway traffic.

On the current Vercel Hobby deployment, `.github/workflows/token-indexer.yml` invokes the worker every five minutes using GitHub OIDC. The server pins issuer, audience, numeric repository/owner IDs, branch, workflow path, algorithm and permitted trigger types; no persistent GitHub upload or database credential is sent to the app. GitHub schedules are best effort and may be delayed. A protected cron-secret alternative and the Express worker interval support other hosting arrangements. Repeated failures surface in the workflow logs while durable retry state is retained.

Identity verification follows the [GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc) using [`jose` JWT verification](https://github.com/panva/jose). The scheduler choice respects [Vercel Hobby cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Migrations are additive/idempotent and serialized during initialization. Verify them on an isolated Neon branch with `B20_TEST_DATABASE_URL` and `pipeline-postgres.integration.test.ts` before deploying. Consumer adoption remains an external integration step; serving a standard token list does not subscribe third-party wallets or DEXs automatically.

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
