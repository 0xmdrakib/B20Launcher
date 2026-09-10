# Public token information

B20 Launcher exposes confirmed launches for wallet, explorer, DEX, and indexer integrations. Base chain ID: `8453`. Production API origin: `https://b20launcher.rakibhq.xyz`.

| Endpoint | Response |
| --- | --- |
| `GET /api/tokens?limit=100&after=<address>` | Address-ordered catalogue with `tokens` and `nextCursor`; limit 1–500. Omit `after` for the first page. |
| `GET /api/tokens/changes?after=0&limit=50` | Append-only verified changes with numeric `revision`, `nextCursor`, and `hasMore`; limit 1–100. Persist `nextCursor` between polls. |
| `GET /api/tokens/<address>` | Name, symbol, decimals, HTTPS image, IPFS image, contract URI, public metadata, and deployment transaction. |
| `GET /api/tokens/<address>/metadata` | Published EIP-7572 metadata JSON. |
| `GET /api/tokens/<address>/logo` | Verified PNG bytes, with an ETag. |
| `GET /api/tokenlist` | Token Lists JSON with `logoURI`, for consumers supporting that specification. |
| `GET /api/b20/recent` | Latest 20 published tokens. |
| `/token/<address>` | Public token page and wallet import action. |

These GET endpoints require no account, API key, wallet connection, or signature. The Next.js endpoints allow cross-origin reads and conditional requests. Successful JSON responses cache for 60 seconds; errors are not cached. Paginated catalogue cursors are addresses, not time cursors: start a fresh crawl to discover newly added addresses that sort before a previous cursor.

Example token: `0xb200000000000000000000D9B4BfBC70F8929C64`.

```js
const origin = "https://b20launcher.rakibhq.xyz";
const address = "0xb200000000000000000000D9B4BfBC70F8929C64";
const response = await fetch(`${origin}/api/tokens/${address}`);
if (!response.ok) throw new Error(`Token lookup failed: ${response.status}`);
const token = await response.json();
// token.logoURI is an HTTPS URL; token.imageIpfs is the permanent IPFS URI.
// Cache by (token.chainId, token.address), never by token.symbol alone.
```

## Provenance and publication

The catalogue projects existing committed metadata stages joined to their launch records. Older completed launches appear automatically. Staged, merely quoted, reverted, and unpublished launches are excluded. Name, symbol, decimals, and address are derived from the bound transaction calldata and checked against the staged contract URI and deterministic address. A later overwritten quote payload cannot replace this identity.

Before a new launch transaction, publication requires private stage credentials, a bound transaction, and a wallet-signed publication intent. Both IPFS files are uploaded and retrieved with byte verification before the frontend broadcasts. Public catalogue inclusion still requires the matching successful Base receipt. Public DTOs contain no stage identifiers, credentials, signatures, calldata, or server keys. The logo endpoint resolves only through the configured HTTPS IPFS gateway and fixed `ipfs.io` fallback, refuses redirects, limits response size, and verifies SHA-256 before serving raster bytes.

The immediate launch snapshot is labelled `metadataSource: "confirmed-launch"`. After safe-block reconciliation, records use `metadataSource: "onchain-contractURI"`, `revision`, and `updatedAt`. Names, symbols and decimals follow the current native token; the JSON is read from its current `contractURI`. Later changes appear in `/api/tokens/changes`, including changes to previously indexed addresses. `updatedAt` is the last content change, not a promise of uninterrupted gateway availability. Unsupported non-IPFS profile/image locations or failed verification retain the last verified snapshot and generate retries.

Router: `0x24c73392d269ce652203a1d1155422a006809ef1`.

```solidity
event PlatformB20Launched(
    address indexed issuer,
    address indexed token,
    uint8 indexed variant,
    bytes32 salt,
    string contractURI
);
```

In the new launch flow, IPFS publication and verification precede the transaction. Discovery is persisted before the browser may broadcast, so disconnecting does not lose the indexing job. Indexers should still retry transient gateway failures. Existing completed launches are backfilled without another onchain transaction.

## Token Lists and wallet imports

The list uses the [Token Lists specification](https://github.com/Uniswap/token-lists). The metadata API preserves original labels. List display labels longer than the specification permits are shortened to 60 characters for names and 20 for symbols, with originals retained under `extensions`. The specification permits up to 10,000 entries; beyond that the single-list endpoint returns HTTP 413 and consumers should use the paginated catalogue. Empty catalogues return 404 for the list. Versions persist in Postgres: additions increment minor, metadata edits increment patch, and removals or decimal changes increment major. Unchanged lists keep their version and ETag.

For a consumer starting a continuous sync, consume the changes feed from cursor `0` and retain `nextCursor` after processing each page. Repeat while `hasMore` is true, then poll using that same cursor. The address cursor on `/api/tokens` is for catalogue pagination, not continuous syncing. Rows expose only verified public token fields.

The user-triggered Add to wallet action calls `wallet_watchAsset` with the published HTTPS image and correct decimals, after checking Base. It does not request a signature or transfer funds. Wallet support varies and the wallet may reject the request, including symbols exceeding its own length limit. [MetaMask guide](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/display-tokens/), [Base reference](https://docs.base.org/sdks/base-account/reference/core/provider-rpc-methods/wallet_watchAsset).

## Consumer onboarding

For an aggregator integration, provide the API origin, chain ID, router/event above, a sample token, and the feed schema. Confirm which endpoint or event stream the consumer accepts and how it refreshes token images. Creating this API does not subscribe an external platform to it.

[Prepared consumer requests and acceptance procedure](integrations/onboarding-requests.md) contain the verified official routes and provider-specific drafts. Run `pnpm test:visibility` for the acceptance checker's identity tests, then `pnpm check:visibility <address> <report.json>` for read-only live checks. An unavailable provider or missing logo does not count as integration success.

Pool discovery and logo ingestion are separate checks. B20 Launcher does not create liquidity pools. Consumer-specific integration, asset-list inclusion, or explorer token-profile approval may still be required. No per-token CoinGecko submission is assumed as the platform's operating model. See [the launchpad research](token-logo-discovery-research.md) for the evidence.
