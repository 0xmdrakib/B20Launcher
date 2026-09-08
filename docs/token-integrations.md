# Public token information

B20 Launcher exposes confirmed launches for wallet, explorer, DEX, and indexer integrations. Base chain ID: `8453`. Production API origin: `https://b20launcher.rakibhq.xyz`.

| Endpoint | Response |
| --- | --- |
| `GET /api/tokens?limit=100&after=<address>` | Address-ordered catalogue with `tokens` and `nextCursor`; limit 1–500. Omit `after` for the first page. |
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

Publication still requires the private stage credentials, the bound transaction, and a successful Base receipt before Lighthouse uploads. Public DTOs contain no stage identifiers, credentials, calldata, or server keys. The logo endpoint fetches only the configured HTTPS gateway plus a validated CID, refuses redirects, limits response size, and verifies the stored SHA-256 before serving bytes.

Records are labelled `metadataSource: "confirmed-launch"`. They represent the metadata published through this launch flow. Later metadata-admin changes made outside this platform are not yet reconciled into this catalogue; consumers needing those updates must follow the contract's current `contractURI` and update events.

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

The receipt precedes IPFS publication. Indexers reading the event directly should retry unavailable URIs; catalogue entries become visible after successful publication. No new on-chain transaction is needed to expose an existing committed launch through these endpoints.

## Token Lists and wallet imports

The list uses the [Token Lists specification](https://github.com/Uniswap/token-lists). The metadata API preserves original labels. List display labels longer than the specification permits are shortened to 60 characters for names and 20 for symbols, with originals retained under `extensions`. The specification permits up to 10,000 entries; beyond that the single-list endpoint returns HTTP 413 and consumers should use the paginated catalogue. Empty catalogues return 404 for the list. The current additive catalogue increments the minor list version with the entry count; future gateway-format changes must bump the list patch version, and removals must bump its major version. ETags also change with the response contents.

The user-triggered Add to wallet action calls `wallet_watchAsset` with the published HTTPS image and correct decimals, after checking Base. It does not request a signature or transfer funds. Wallet support varies and the wallet may reject the request, including symbols exceeding its own length limit. [MetaMask guide](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/display-tokens/), [Base reference](https://docs.base.org/sdks/base-account/reference/core/provider-rpc-methods/wallet_watchAsset).

## Consumer onboarding

For an aggregator integration, provide the API origin, chain ID, router/event above, a sample token, and the feed schema. Confirm which endpoint or event stream the consumer accepts and how it refreshes token images. Creating this API does not subscribe an external platform to it.

Pool discovery and logo ingestion are separate checks. B20 Launcher does not create liquidity pools. Consumer-specific integration, asset-list inclusion, or explorer token-profile approval may still be required. No per-token CoinGecko submission is assumed as the platform's operating model. See [the launchpad research](token-logo-discovery-research.md) for the evidence.
