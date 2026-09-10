# Automatic token identity and logo discovery for B20 Launcher

Implementation note (September 11): the source audit below describes revision `f145ae4`. Wallet-authorized prepublication, durable recovery, current-profile reconciliation and the incremental feed have since been implemented. See [the current architecture](ARCHITECTURE.md#durable-indexing) and [consumer API](token-integrations.md). Pool development remains a separate owner-planned task; consumer acceptance has not been assumed.

## Recommendation

B20 Launcher should retain Base's native B20 identity and ERC-7572 metadata, make the referenced content available before a launch is broadcast, and maintain a durable event-driven metadata service. Consumers should discover tokens through the canonical Base factory or a platform source they have agreed to ingest. One integration can then cover future launches; submitting a separate CoinGecko form for every token is not the appropriate operating model. The architecture requires both reliable publication and actual consumer adoption. [1–3]

The Uniswap application is a legitimate platform contact route, but it is not a universal logo-registration endpoint. Launches placement has its own eligibility criteria, including more than 2% of launchpad trading volume on the relevant chain. B20 Launcher's present issuance router creates no pool, and there is no evidence that it meets that threshold. The application can accurately request technical routing without claiming eligibility. [4–5]

For the current product, the best next engineering work is publication reliability, canonical B20 event indexing, and metadata-update reconciliation. A separate trading-launch option can later provide eligible pools for DEX discovery. If the product instead becomes a standard fixed-supply trading launchpad, building on an existing launch protocol is a faster alternative, but changes its token controls and economics. It should be evaluated as a product decision, not introduced as a logo fix. [6–9]

## What “automatic” actually requires

Four independent operations are often conflated. Token identity comes from chain calls and events. An image is resolved from a metadata URI or another accepted source. Trading discovery comes from recognized pools and market activity. Finally, each wallet, explorer or DEX decides what its interface displays. Success in one operation does not establish success in the others. [1–3, 10–13]

| Layer | Automatic input | B20 Launcher's current position |
| --- | --- | --- |
| Identity | Base factory events and ERC-20 reads | Correct identities were verified for both reported test launches. |
| Publication | Retrievable ERC-7572 JSON and image bytes | Existing test assets resolve; publication starts after receipt confirmation. |
| Discovery | Factory events, a recognized launch protocol, or an accepted catalogue | Public catalogue exists; consumer adoption is not confirmed. |
| Trading | Supported pool, routing, liquidity and activity | Current router does not create a pool. |
| Display | Consumer metadata resolver, cache and wallet preferences | No universal default-display guarantee; check each target. |

“Anyone can access metadata” is achievable with public chain reads, public IPFS content and an unauthenticated HTTPS representation. “Every application will automatically display it” additionally requires those applications to implement a resolver and accept its source. Neither Base nor ERC-7572 operates a mandatory registry that changes every third-party interface. This conclusion follows from the separate standards and consumer processes, rather than an assertion that automation is impossible. [1–3, 10–14]

## What other launch platforms implement

### o1 Exchange: the closest native B20 comparison

o1's Base flow creates a native B20 token, publishes its public profile, and opens a Uniswap v4 market. Its documented preparation sequence stores the IPFS profile before the user signs. After confirmation, confirmed events, live contracts and indexed application data supply the token page and discovery views. This directly supports the pattern of pre-publication plus automated indexing. The documents do not identify every external platform's private image-ingestion arrangement. [6, 15]

The current o1 token model is materially narrower than B20 Launcher's configurable issuance model: fixed supply, no token administrator, permanent liquidity, and optional profile-editing permission. All supply enters the initial liquidity position, without a creator deposit of the paired asset. Reusing this flow could retain native B20 tokens, but would change minting, administrative and market behavior. [6]

o1 publishes current and historical contract registries and chain-scoped read endpoints. Its documented token API requires an API key, while public configuration snapshots identify deployments. Retaining historical factories matters: changing the current deployment must not make earlier tokens disappear from indexing. These are useful patterns for B20's integration package; they are not evidence that arbitrary B20Launcher tokens are already covered by o1. [16–17]

### Flaunch: shared protocol and image pipeline

Flaunch explicitly documents building a branded launchpad over its existing protocol. Its image guide recommends uploading the image, obtaining the IPFS result, and then launching. Its SDK can upload the image and JSON and supply the generated metadata URI to the transaction. Its REST data API exposes token details with images and discovery endpoints. The useful lesson is an integrated launch and data system, rather than per-token manual profile maintenance. [7–9]

Older Flaunch search results described work with routers, indexers and security providers, but the old “For Aggregators” URL now returns Page Not Found. That historical page is not sufficient evidence of today's integration coverage. The recommendation here relies on the current image, launchpad and data API documents instead. Neither using Flaunch metadata formatting nor copying its endpoint names would enroll an unrelated factory in its downstream integrations.

### Clanker: indexed factory output and APIs

Clanker's SDK accepts token images, metadata and pool configuration. Its public API offers token discovery, address-oriented records, deployment-time filters and cursor pagination. Its documentation also supports alternative interfaces deploying through the shared protocol. This is a concrete way for many branded interfaces to share deployment infrastructure rather than each inventing a token-data distribution system. [18–20]

A live read provides a useful counterexample to a mandatory CoinGecko listing. Clanker's API returned the Base token **Besman**, address `0x2e5f4a60ffc6C8aeD22ec8909Ac9d6A5803D5B07`, deployed at 2026-09-10 21:19:45 UTC. At 21:25:46 UTC, GeckoTerminal's token-info API returned an `image_url` while `coingecko_coin_id` was `null`. The saved observation proves an image record can exist without a CoinGecko coin ID. It does not prove who supplied that image, that it is visually identical to Clanker's, or that no manual action occurred. [21]

Trading compatibility also remains consumer-specific for established platforms. Clanker's compatibility document describes custom v4 hooks and lists supported venues, with a dated July 2025 coverage snapshot. It should not be treated as a current guarantee for every bot. The broader engineering lesson is to validate hook and route support separately from name and image discovery. [22]

### Zora: the same metadata standard plus a protocol data service

Zora documents ERC-7572 coin metadata, including IPFS images and owner-controlled URI updates. It also provides coin creation, metadata-building and query tools. This demonstrates that the standard chosen by B20 Launcher is compatible with a real launch-protocol design. Adopting the JSON format alone does not cause Zora's indexer or its consumers to ingest a different platform's tokens. [23]

## What the target consumers actually document

| Consumer | Supported evidence | Implication for B20 Launcher |
| --- | --- | --- |
| Uniswap Launches | Platform application; volume criterion; initial announcement launched on Robinhood Chain. [4–5] | Apply truthfully. Confirm Base coverage and metadata-source scope rather than assuming acceptance. |
| Uniswap general token information | General support identifies CoinGecko and a 48-hour propagation interval after changes there. [10] | This does not establish that every launchpad token needs a manual main-site listing, or that every GeckoTerminal record propagates to Uniswap. |
| CoinGecko Onchain / GeckoTerminal | Token-info API can return images and metadata sourced onchain; main CoinGecko reviewed data is distinguished from onchain data. [11] | Ask for native B20/factory metadata support and an accepted ingestion contract. Reading its API does not register our source. |
| DEX Screener | Automatic market listing after a liquidity pool and at least one transaction; information from external lists and a separate paid update route. [12] | Create an eligible market only when trading is intended; independently verify image ingestion. An arbitrary public list is not automatically an accepted list. |
| MetaMask | User settings affect detection; `wallet_watchAsset` prompts the user to add an asset. Legacy contract-metadata repository is effectively frozen. [13–14] | Keep the existing wallet-import action. Source-level detection requires supported consumer behavior; per-token repository PRs are not the scalable default. |
| BaseScan | Published normal process requires ownership verification and verified source; token updates are reviewed. [24] | Native B20 needs a confirmed explorer-specific path. Ordinary Solidity verification cannot reproduce native precompile bytecode. |

CoinGecko's onchain API documentation is particularly important: it explicitly permits metadata sourced onchain, and the live Clanker sample has no main CoinGecko coin ID. Therefore the earlier inference that manual CoinGecko listing was the required launcher workflow was too broad. The general Uniswap support article and the richer onchain API describe different surfaces; neither proves that Uniswap consumes every onchain image field. [10–11, 21]

A platform-level request is a valid way to establish a supported integration or identify a missing resolver. The outcome must be an accepted technical source, such as canonical factory indexing or an agreed feed. “Request received” is not that outcome. Once the source is connected, future launches should require no individual form; if the consumer only offers individual review, that consumer remains a separate coverage limitation.

## Findings in the current B20 implementation

This audit inspected repository revision `f145ae4ba70f9ce238fcfd6542bdbb22bd5efa18` and read production endpoints on September 11, 2026, Asia/Dhaka. Current source files and saved observations distinguish implemented behavior from the recommendations below. No application code, wallet transaction or liquidity position was changed during this research. [21, 25–28]

**The metadata format and existing logo bytes are correct.** The router supplies `updateContractURI` in creation-time initialization, using the native Base factory. The earlier receipt audit found `B20Created` identities and `ContractURIUpdated()` for both reported tokens. The current read again returned the intended 4,565-byte PNG with SHA-256 `36a709228ab90e0010e60548b053f6a9d75eff13d3e2676dfaa19b3247c06a4c`. Our 512-by-512 normalization is a product choice; Base's cited guidance does not mandate that pixel size. [1–3, 25–26]

**Publication can race the first external lookup.** `prepareMetadata` computes CIDs and saves the bytes without uploading them. The browser waits for a successful launch receipt and calls `commitMetadata`; the server then verifies the binding and uploads to Lighthouse. This protects paid storage from unauthenticated upload abuse, but creates a real interval in which the onchain URI can exist before its content is available. That interval is an architectural fact, not a measured explanation for every missing image. [27]

**Recovery depends on the browser.** The frontend retries publication and permits manual retry, but there is no autonomous receipt-to-publication worker in the inspected flow. Bound stages initially expire after 30 minutes; entering publication extends retention to at least 24 hours. Cleanup can delete expired uncommitted bytes. A durable chain replay cannot reconstruct an image if the only copy of its bytes was deleted before upload. [27]

**The public feed is a launch snapshot.** It projects committed staging records. Later `updateContractURI`, name or symbol changes made outside the launcher are not reconciled. Its cursor is an address, not an append-only change offset; keeping only the last cursor between polling cycles can miss a new lower-sorting address. The Token List version currently follows token count, which is insufficient once metadata-only updates are supported. [28–29]

**The issuer does not open a market.** The router has no pool creation. Re-running the visibility check found zero DEX Screener pairs and a GeckoTerminal 404 for the test token. Blockscout now returns a token record but no logo; the earlier baseline had no record. This is a more precise current state than “nothing recognizes the token.” The check does not cover fresh Uniswap, BaseScan or wallet UI observations. [26]

**Native B20 recognition is a separate compatibility issue.** Base documents a `0xef` bytecode stub and the stronger `isB20Initialized` check. Indexers should not require conventional ERC-20 function selectors in deployed bytecode or only ordinary CREATE traces. The two test tokens already had correct factory-event and RPC names, so a missing image is not sufficient to explain an “Unknown” name. The exact internal EtherDrops failure remains unverified. [2, 25]

## Proposed implementation

### 1. Make content available before broadcasting

Add a readiness gate: normalized image and immutable metadata must be retrievable before the wallet receives a launch request. Retain Lighthouse and canonical IPFS URIs; changing to a different pinning company does not by itself improve consumer adoption. The readiness response should bind the exact metadata CID, issuer, chain, expiry and launch intent, and the later launch record should still require the successful, matching transaction.

Moving the existing anonymous prepare route directly to unrestricted paid uploads would remove an intentional protection. Instead, authorize a bounded pre-publication operation using a wallet-authenticated launch intent, enforce per-wallet and per-network abuse controls plus a global storage budget, deduplicate content, and reject oversized or unsafe media. A wallet signature establishes control, not resistance to unlimited new wallets; quotas need a global backstop. This is a proposed replacement authorization model, not a description of current behavior.

If the strict rule “paid uploads only after a confirmed transaction” must remain, preserve it and implement durable post-receipt publication with retries. That alternative closes the lost-browser failure but cannot guarantee availability at the instant of the first creation event. The tradeoff must be explicit. Pre-publication and unrestricted anonymous uploading are not equivalent requirements.

### 2. Index chain events durably

Use the Base factory's `B20Created` event to recognize native tokens and B20 Launcher's `PlatformB20Launched` event to establish platform provenance. Persist chain ID, token, router, transaction hash, block number, block hash and log index. Track a block cursor, replay missed ranges, deduplicate logs and handle reorgs. Do not attribute every token from the shared Base factory to B20 Launcher.

Persist launch intent and publication work before waiting for the browser. A server worker should verify matching receipts and finish outstanding publication independently. Retain necessary bytes until a terminal outcome is established, not simply until a short UI session expires. Lease jobs, cap attempts, expose operational failures and support replay without creating duplicate records. These safeguards are useful under either publication order.

### 3. Reconcile metadata and publish changes

Follow URI-update events and relevant native name/symbol updates, then reread the canonical state at a recorded block. Store metadata versions and provenance separately from the launch snapshot. A failed refresh must remain retryable and must not permanently replace a previously valid image with a placeholder. Consumers need a documented precedence policy when onchain identity and JSON fields disagree.

Add a monotonic change sequence or a stable `(updatedAt, unique ID)` cursor, with an explicit snapshot boundary and upsert/remove semantics. Retain the existing address catalogue for complete crawls. Maintain real Token List semantic versions: additions change minor, metadata changes patch, removals or identity-key changes major. Keep HTTPS images, IPFS URIs, ETags and bounded public reads. [29]

External metadata URLs introduce risks that the current fixed Lighthouse host avoids. A reconciliation worker must restrict outbound destinations, reject private-network targets and unsafe redirects, impose time/size limits, validate MIME types, and serve sanitized media. The public API must continue to exclude stage secrets, signatures, credentials and private storage fields. Adopting live metadata should not silently weaken the existing security boundary.

### 4. Integrate the source consumers actually use

Prioritize canonical native B20 support with Base-related indexers and CoinGecko/GeckoTerminal's onchain data path. Supply the factory event ABI, initialization check, metadata-update behavior and reproducible test records. Where a consumer requires a platform feed, obtain its actual schema, polling or delivery mechanism, chain scope, cache policy and provenance requirements. A provider that already reads native B20 may need a retry or URI-resolution correction rather than a new custom catalogue.

Use the Uniswap application to request the appropriate Base data integration owner, while tracking Launches placement separately. For DEX Screener, keep pool discovery and profile ingestion as different checks. For MetaMask and BaseScan, implement only supported routes confirmed by those consumers; do not invent metadata-write APIs or repeatedly automate individual profile forms. Existing support inquiries can establish the connection, but they do not substitute for this engineering work.

### 5. Add a market only where the product calls for one

For public trading launches, design an optional pool path with explicit paired asset, allocation, opening price, pool version, fee and liquidity ownership. Validate current routing support before choosing a custom hook. Restricted or administratively controlled B20 assets need compatibility checks rather than automatic treatment as unrestricted memecoins. A pool is relevant to DEX discovery; it is not required for ordinary `name()` and `symbol()` reads.

| Option | Main advantage | Main cost or constraint | Assessment |
| --- | --- | --- | --- |
| Keep current B20 issuer and add indexing/publication service | Preserves current token controls and native standard | Consumer adoption and optional pool work remain | Recommended for this product. |
| Build a branded flow on o1's native B20 launch protocol | Shared launch, pool and indexed protocol model | Fixed supply/adminless market behavior; external coverage still needs validation | Evaluate if the product becomes a trading launchpad. |
| Build on Flaunch, Clanker or Zora | Existing launch and data infrastructure | Different contracts, permissions, fees and protocol dependencies | Alternative product architecture, not a metadata-only patch. |
| Automate individual listing forms | Little initial engineering | Ongoing per-token work, review and incomplete coverage | Reject as the default workflow. |

## Acceptance criteria

The first engineering milestone is a launch that remains recoverable after closing the browser, with metadata available when indexers first fetch it. A second milestone is an agreed consumer source producing the correct address, identity and image. The strongest automatic-ingestion test is a subsequent eligible token appearing through the same connection without any token-specific submission. Cache refresh after an authorized logo change must also be tested.

| Test | Evidence required |
| --- | --- |
| Before broadcast | Both CIDs retrieve valid intended content; public reads require no storage key. |
| After confirmed launch | Factory identity, router provenance, current URI and catalogue entry agree. |
| Browser interruption | Server finishes publication/indexing without the original browser session. |
| Failure and recovery | Temporary RPC/gateway errors retry; reorgs and duplicate logs are handled. |
| Metadata update | New authorized URI becomes the current record; old versions remain auditable. |
| Consumer image | Correct chain/address plus image in consumer API and actual interface; compare visually if recompressed. |
| Future launch | New eligible token appears without another individual application. |
| Wallet | Test the target wallet's detection settings separately from explicit wallet import. |

No arbitrary promise of “all wallets within N seconds” is justified by the reviewed sources. Publish measured coverage and latency for named consumers, and distinguish absent markets, unknown identities, unavailable assets and missing images. That produces an actionable integration status rather than a single misleading success flag.

## Sources and evidence

Public sources were checked on September 11, 2026, Asia/Dhaka. Dates below are publisher dates where visible; undated living documentation is identified as such. Private support correspondence and contact details are excluded. Recommendations and proposed designs above are engineering conclusions, not claims that a provider has accepted them.

1. Base, [B20 Specification](https://docs.base.org/specifications/b20/specification-overview), living documentation.
2. Base, [B20 Execution Architecture](https://github.com/base/base-std/blob/be6d0450890e20fc4a739aeaff5e839f234d12a6/docs/architecture.md), pinned revision `be6d045`.
3. Ethereum Improvement Proposals, [ERC-7572: Contract-level metadata via contractURI](https://eips.ethereum.org/EIPS/eip-7572), created December 6, 2023; draft status at review.
4. Uniswap Labs, [How to use the Uniswap Launches tab](https://support.uniswap.org/hc/en-us/articles/48369443960333-How-to-use-the-Uniswap-Launches-tab), updated August 24, 2026.
5. Uniswap Labs, [Launch Aggregator: Explore Top Uniswap Launchpads in One Place](https://blog.uniswap.org/launch-aggregator-explore-top-uniswap-launchpads-in-one-place), July 30, 2026; links the [platform application](https://share.hsforms.com/1HxXolMxdSsW-4iuTK802jws8pgg).
6. o1 Exchange, [Token creation](https://docs.o1.exchange/launchpad/create/token-creation), living documentation.
7. Flaunch, [Build a Launchpad](https://docs.flaunch.gg/getting-started/launch-a-launchpad.md), living documentation, retrieved from current sitemap.
8. Flaunch, [Token Images](https://docs.flaunch.gg/support/token-images.md), living documentation.
9. Flaunch, [REST Data API](https://docs.flaunch.gg/references/restful-data-api.md), living documentation; schema examples are illustrative, not measured deployments.
10. Uniswap Labs, [How do I change my token's logo or information on Uniswap interfaces?](https://support.uniswap.org/hc/en-us/articles/29883356032525-How-do-I-change-my-token-s-logo-or-information-on-Uniswap-interfaces), updated August 7, 2026.
11. CoinGecko, [Token Info by Token Address](https://docs.coingecko.com/reference/token-info-contract-address), living API documentation; distinguishes onchain metadata from reviewed CoinGecko data.
12. DEX Screener, [Token Listing](https://docs.dexscreener.com/token-listing), living documentation.
13. MetaMask, [Display tokens](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/display-tokens/), updated August 7, 2026.
14. MetaMask, [contract-metadata README](https://github.com/MetaMask/contract-metadata), current repository notice.
15. o1 Exchange, [Interface and data flow](https://docs.o1.exchange/launchpad/architecture/frontend-indexer), living documentation.
16. o1 Exchange, [Data and AI access](https://docs.o1.exchange/launchpad/integration/data-ai), living documentation.
17. o1 Exchange, [Read endpoints](https://docs.o1.exchange/launchpad/api/read-endpoints), living API documentation.
18. Clanker, [Official SDK](https://github.com/clanker-devco/clanker-sdk), current README.
19. Clanker, [Public Tokens API](https://github.com/clanker-devco/DOCS/blob/main/api-reference/public/tokens.md), current documentation source.
20. Clanker, [Alternative Interface Deployments](https://github.com/clanker-devco/DOCS/blob/main/general/token-deployments/alternative-interface-deployments.md), current documentation source.
21. [Saved read-only live observations](integrations/research-live-20260911.json), collected September 10, 2026 21:25 UTC / September 11 in Dhaka; includes original public API URLs.
22. Clanker, [Compatible Trading Platforms](https://github.com/clanker-devco/DOCS/blob/main/references/compatible-trading-platforms.md), compatibility list explicitly dated July 8, 2025; historical coverage only.
23. Zora, [Coins Metadata](https://docs.zora.co/coins/contracts/metadata), living documentation; [documentation index](https://docs.zora.co/llms.txt) identifies creation and query interfaces.
24. BaseScan, [How to Verify Contract Address Ownership?](https://info.basescan.org/verifyaddress/), updated May 14, 2024; [Verifying Contracts](https://info.basescan.org/how-to-verify-contracts/), updated September 20, 2024. These generic processes do not document a B20-native exception.
25. [Base B20 identity and logo audit](integrations/base-logo-identity-audit.md), September 9, 2026, with receipt/RPC evidence and limitations.
26. [Current B20 visibility observation](integrations/visibility-research-20260911.json), September 10, 2026 21:25:52 UTC / September 11 in Dhaka.
27. B20 Launcher source at reviewed revision: [IPFS staging/publication](https://github.com/0xmdrakib/B20Launcher/blob/f145ae4ba70f9ce238fcfd6542bdbb22bd5efa18/apps/api/src/services/ipfs.ts), [stage storage and expiry](https://github.com/0xmdrakib/B20Launcher/blob/f145ae4ba70f9ce238fcfd6542bdbb22bd5efa18/apps/api/src/services/store.ts), [browser launch flow](https://github.com/0xmdrakib/B20Launcher/blob/f145ae4ba70f9ce238fcfd6542bdbb22bd5efa18/apps/web/src/components/LaunchConsole.tsx).
28. B20 Launcher, [public token projection](https://github.com/0xmdrakib/B20Launcher/blob/f145ae4ba70f9ce238fcfd6542bdbb22bd5efa18/apps/api/src/services/public-tokens.ts) and [launch router](https://github.com/0xmdrakib/B20Launcher/blob/f145ae4ba70f9ce238fcfd6542bdbb22bd5efa18/packages/contracts/src/B20LaunchRouter.sol), reviewed revision.
29. Uniswap, [Token Lists specification](https://github.com/Uniswap/token-lists), living repository documentation, including semantic-version rules and public hosting.
