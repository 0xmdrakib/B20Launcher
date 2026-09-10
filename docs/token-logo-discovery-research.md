# Token logo discovery: launchpad comparison

For the current implementation audit, live observations, consumer-source distinctions and recommended architecture, see the [September 11 deep research](automatic-token-metadata-research.md). The implementation findings below describe the earlier baseline.

Research date: 2026-09-09. Scope: public documentation, read-only API checks, and the B20Launcher implementation. No transactions, listing submissions, or provider configuration changes were made.

The earlier claim that every launched token must be manually submitted to CoinGecko was too broad. Launchpads can distribute token information through platform APIs, indexed deployment events, and integrations with consumer platforms. B20Launcher currently completes the IPFS publication step but does not implement this distribution path. The image format itself is consistent with an established Base launchpad's metadata standard.

## What other launchpads provide

| Platform | Verified implementation pattern | Evidence |
| --- | --- | --- |
| Zora | EIP-7572 metadata with an `image` IPFS URI; separate coin queries and a public REST API expose coin information and media. | [Metadata](https://docs.zora.co/coins/contracts/metadata), [coin queries](https://docs.zora.co/coins/sdk/queries/coin), [REST API](https://docs.zora.co/coins/sdk/public-rest-api) |
| Clanker | Public paginated token discovery, pool lookup, factory/event information, and on-chain deployment indexing. Live token records include `img_url`. | [Public API](https://github.com/clanker-devco/DOCS/blob/main/api-reference/public/README.md), [token endpoints](https://github.com/clanker-devco/DOCS/blob/main/api-reference/public/tokens.md) |
| Flaunch | IPFS image/metadata upload, token discovery and detail APIs, documented cooperation with indexers including CoinGecko and DEX Screener. | [Images](https://docs.flaunch.gg/support/token-images), [aggregator integration source](https://github.com/flayerlabs/flaunch-gitbook/blob/main/readme/for-aggregators.md), [data API source](https://github.com/flayerlabs/flaunch-gitbook/blob/main/references/restful-data-api.md) |

Flaunch's previous `/readme/for-aggregators` documentation URL currently returns a moved-page notice. The official GitHub documentation source still contains the integration guide. Its token discovery feed lists deployed addresses; its separate detail API documents image and social information. A live request to the documented development API did not return parseable JSON during this research, so that API is a documented design example, not a verified availability result.

## Live comparison: logo without a CoinGecko coin ID

Clanker's public recent-token API returned the Base token `Mag7X` at `0x1938D4f563f8D3957FEfDB26acA3980Cb0a7a755`, deployed at `2026-09-08T20:39:33Z`, with an `img_url` and a Uniswap pool ID.

[GeckoTerminal's public token information API](https://api.geckoterminal.com/api/v2/networks/base/tokens/0x1938D4f563f8D3957FEfDB26acA3980Cb0a7a755/info) returned:

```json
{
  "name": "Mag7X",
  "coingecko_coin_id": null,
  "image_url": "https://assets.geckoterminal.com/gii9x3kidcsj9pp83b82mcdmc657",
  "gt_category_ids": ["clanker-world"]
}
```

The image URL returned HTTP 200, `image/jpeg`, 3,108 bytes. DEX Screener also returned the token's pair, but its pair response did not include an `info` image field. Therefore the positive logo result here is specific to GeckoTerminal.

This demonstrates that a GeckoTerminal logo does not require a CoinGecko coin record. It does not reveal the exact private ingestion pipeline or prove whether any individual token received a manual information update. Platform-level integration is separately supported by Flaunch's documentation; it should not be inferred solely from one token response.

## B20Launcher findings

- `packages/b20/src/metadata.ts` builds EIP-7572-style JSON. `apps/api/src/services/ipfs.ts` supplies `image: logo.uri`. Zora uses the same basic standard and URI pattern; there is no evidence that changing `image` to an invented field would solve discovery.
- `packages/contracts/src/B20LaunchRouter.sol` sets `contractURI` and emits `PlatformB20Launched` with the token address and URI. These are usable inputs for an indexer. The router does not create a liquidity pool.
- `apps/web/app/api/b20/recent/route.ts:8` always returns `{ source: "rpc", rows: [] }`. The live endpoint returned the same empty result despite the completed test launch. It is an unimplemented discovery endpoint.
- `apps/api/src/services/b20.ts` exposes initialization status but no resolved public logo record. No implemented token-list feed, consumer submission adapter, or documented B20Launcher consumer integration was found in the repository.
- Successful Lighthouse commit retains prepared metadata in the store but does not publish a discoverable address-to-logo catalogue.

The existing test token is `0xb200000000000000000000D9B4BfBC70F8929C64`. Earlier live checks verified its `contractURI`, metadata JSON, and 512-by-512 PNG on the paid Lighthouse gateway. Uniswap displayed a text placeholder; DEX Screener returned no indexed pair and GeckoTerminal returned no token record. Those results establish incomplete consumer visibility, not a malformed PNG.

An empty B20 feed is a concrete implementation gap, but fixing that endpoint alone would not establish that any external service consumes it. No evidence was found that DEX Screener or GeckoTerminal automatically polls arbitrary launchpad URLs.

## Consumer requirements and limits

Uniswap's general support guidance identifies CoinGecko as a token-information source. Separately, Uniswap now documents a launchpad discovery product and an application process. Its initial announcement concerns Robinhood Chain, so it must not be presented as an immediately available Base integration for B20Launcher. [Logo guidance](https://support.uniswap.org/hc/en-us/articles/29883356032525-How-do-I-change-my-token-s-logo-or-information-on-Uniswap-interfaces), [launchpad announcement](https://blog.uniswap.org/launch-aggregator-explore-top-uniswap-launchpads-in-one-place).

DEX Screener documents automatic token listing after a liquidity pool and at least one transaction, and separate information sources including external token lists. Pool discovery and image ingestion are separate acceptance criteria. [Listing documentation](https://docs.dexscreener.com/token-listing).

GeckoTerminal documents both CoinGecko-derived information and a direct token-information update route. The latter is an option for an individual token, not the proposed operating model for every B20 launch. [Logo documentation](https://support.coingecko.com/hc/en-us/articles/22613463275161-Why-do-some-tokens-have-logos-but-some-do-not).

## Recommended B20 implementation

1. After the existing verified launch and successful IPFS commit, persist a public token record keyed by chain ID and token address. Include name, symbol, decimals, metadata URI, image CID, resolved HTTPS image URL, deployment transaction, and block. Keep private staging credentials out of that record.
2. Implement paginated token discovery and per-address details. Optionally expose a schema-valid Token List with `logoURI` for compatible consumers. Publishing a list does not make it a default list in any DEX. [Token Lists specification](https://github.com/Uniswap/token-lists).
3. Backfill confirmed router events and reconcile missed publication/indexing work. Publish feed entries only after assets are available; retry retrieval failures so a first lookup during publication does not become a permanent missing-logo result. Preserve the current receipt verification and paid-upload protections.
4. Establish platform-level ingestion with each target consumer using its supported integration process. Supply the public feed, router/factory addresses, deployment events, and representative token records. The exact accepted format and availability remain external dependencies.
5. Verify a new token end to end: confirmed deployment, retrievable metadata/image, public catalogue entry, eligible pool discovery where required, consumer API image, and the actual consumer UI. A self-hosted feed or successful gateway request cannot substitute for the final two checks.

The findings above describe the implementation before the follow-up fix. The follow-up adds public catalogue, per-address metadata/logo endpoints, Token Lists output, and wallet import. It derives the catalogue from existing verified publication records rather than adding a duplicate registry. See [implemented interfaces and remaining consumer onboarding](token-integrations.md). External platform ingestion has not been claimed as completed.
