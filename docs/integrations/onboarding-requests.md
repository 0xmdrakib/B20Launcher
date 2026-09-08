# B20 Launcher consumer integration requests

Prepared: 2026-09-09. Submission progress and receipts are recorded in [submission-status.md](submission-status.md). Provider acceptance and automatic ingestion remain unverified.

This is one platform integration per consumer, covering future B20 launches. The sample assets are explicitly test tokens. No individual paid token-profile orders, liquidity operations, fabricated trading volume, or token-list endorsements are proposed.

## Submission register

| Consumer | Verified official route | Request | Follow-through |
| --- | --- | --- | --- |
| GeckoTerminal | [GeckoTerminal support form](https://support.coingecko.com/hc/en-us/requests/new?ticket_form_id=32495890222105) | Route B20's publication feed to the launchpad metadata integration team | Ticket #137396; await source acceptance and adapter requirements |
| DEX Screener | [Partnership form](https://forms.gle/TLbPqn3owY5zvGxh9), linked by the FAQ in [official Discord](https://discord.gg/wpV9vZsbR4) | Request platform metadata ingestion; B20 is an issuer, not a DEX | Form response recorded; await acceptance/adapter requirements |
| Uniswap Labs | [Support form](https://support.uniswap.org/hc/en-us/requests/new) | Request the accepted Base token-information source/onboarding path | Ticket #256149; await their response |
| MetaMask | Contact Support on [official support](https://support.metamask.io/) | Ask about source-level token-list ingestion for Base | Technical Support ticket #131700638; await team response |
| BaseScan | [Contact form](https://basescan.org/contactus), **1.a. General Inquiry** | Ask whether platform feeds or bulk verified-issuer updates are supported | Ticket #846900; await their answer and any ownership verification |

The [CoinGecko support directory](https://support.coingecko.com/hc/en-us/articles/23960919544345-Support-Directory-CoinGecko-Request-Forms) directs requests outside individual listings to support. A DEX/chain listing is not an accurate description of this token issuer.

Uniswap's [Launches application](https://support.uniswap.org/hc/en-us/articles/48369443960333-How-to-use-the-Uniswap-Launches-tab) requires more than 2% of chain launchpad trading volume. No evidence establishes B20's eligibility. Do not submit a claim that it qualifies. A technical token-information inquiry is separate.

MetaMask's [contract-metadata repository](https://github.com/MetaMask/contract-metadata) says it is effectively frozen and recommends EIP-747. Do not generate per-test-token PRs or claim that publishing a Token List automatically enrolls it in MetaMask detection.

BaseScan's [published token-info process](https://info.basescan.org/how-to-update-token-info/) requires its official token-update form, ownership verification and source-code publication. A general inquiry may ask about a platform arrangement; it is not a substitute for an individual token update or evidence that a bulk arrangement exists.

## Shared technical attachment

- Platform: B20 Launcher, https://b20launcher.rakibhq.xyz
- Source and integration documentation: https://github.com/0xmdrakib/B20Launcher/blob/main/docs/token-integrations.md
- Network: Base Mainnet, chain ID 8453.
- Issuance router: `0x24c73392d269ce652203a1d1155422a006809ef1`.
- Event ABI: `event PlatformB20Launched(address indexed issuer, address indexed token, uint8 indexed variant, bytes32 salt, string contractURI)`.
- Token discovery: `https://b20launcher.rakibhq.xyz/api/tokens?limit=100`. Follow `nextCursor` as the `after` query parameter. A new discovery cycle must start from the beginning; the current cursor is address-based, not a chronological change stream.
- Token Lists feed: `https://b20launcher.rakibhq.xyz/api/tokenlist`.
- Address details: `https://b20launcher.rakibhq.xyz/api/tokens/<address>`.
- Published metadata JSON: `https://b20launcher.rakibhq.xyz/api/tokens/<address>/metadata`.
- Verified PNG: `https://b20launcher.rakibhq.xyz/api/tokens/<address>/logo`.
- Public page: `https://b20launcher.rakibhq.xyz/token/<address>`.
- Authentication: none on these read-only endpoints; CORS permits cross-origin reads; conditional GET uses ETags. Keys, staging secrets and signing data are excluded.
- Identity and provenance: token fields are derived from bound launch calldata and deterministic address checks. Publication follows successful receipt verification and IPFS upload verification. The record exposes its deployment transaction hash and content SHA-256.
- Metadata format: EIP-7572 `contractURI()` with JSON `image: ipfs://...`; HTTPS image resolution uses the project's Lighthouse gateway.
- Freshness: published launch snapshots, labelled `metadataSource: confirmed-launch`. Later metadata-admin changes made outside the launcher are not currently reconciled; do not describe the feed as a live source of arbitrary subsequent on-chain updates.
- Trading: B20 creates tokens; this router does not create liquidity pools. No pair is currently returned for the representative test token by DEX Screener. Trading eligibility and logo ingestion are separate acceptance checks.

Representative token: `0xb200000000000000000000D9B4BfBC70F8929C64`, B20 Logo Test / B20TEST, 18 decimals.

- [Token page](https://b20launcher.rakibhq.xyz/token/0xb200000000000000000000D9B4BfBC70F8929C64)
- [Metadata](https://b20launcher.rakibhq.xyz/api/tokens/0xb200000000000000000000D9B4BfBC70F8929C64/metadata)
- [PNG](https://b20launcher.rakibhq.xyz/api/tokens/0xb200000000000000000000D9B4BfBC70F8929C64/logo), 512 by 512, SHA-256 `36a709228ab90e0010e60548b053f6a9d75eff13d3e2676dfaa19b3247c06a4c`.
- [Confirmed launch transaction](https://basescan.org/tx/0x7f24447d6cf26ff1b8613a2f7e29b2ab69abbd94aad49e8dd6fb2dd9aa270d29), Base block 51054858.

## GeckoTerminal draft

Subject: Base launchpad metadata source integration — B20 Launcher (chain 8453)

Hello GeckoTerminal team,

We would like to integrate B20 Launcher as a platform-level source for token names, logos and public metadata on Base, so future confirmed launches can be discovered without submitting a separate token-info form for every asset.

B20 Launcher is a non-custodial token issuer at https://b20launcher.rakibhq.xyz. It is not a new DEX or chain. Its router is 0x24c73392d269ce652203a1d1155422a006809ef1 on chain 8453, emitting PlatformB20Launched(address indexed issuer, address indexed token, uint8 indexed variant, bytes32 salt, string contractURI).

Public catalogue: https://b20launcher.rakibhq.xyz/api/tokens?limit=100
Token list: https://b20launcher.rakibhq.xyz/api/tokenlist
Integration documentation: https://github.com/0xmdrakib/B20Launcher/blob/main/docs/token-integrations.md
Sample: https://b20launcher.rakibhq.xyz/token/0xb200000000000000000000D9B4BfBC70F8929C64

The APIs require no key. Per-address records expose confirmed launch identity, EIP-7572 metadata, an HTTPS image, IPFS content URIs and the deployment transaction. PNG bytes are checked against the stored SHA-256. The catalogue includes only successfully published launch records; later metadata-admin updates outside our flow are not yet reconciled.

The sample is a test token with no GeckoTerminal record or indexed DEX Screener pair at our latest check. Our router does not create liquidity pools. We are requesting source onboarding, not claiming trading eligibility or asking for an individual paid profile update.

Please route this to the team handling launchpad token metadata ingestion. Can you accept this feed or the router events, and what adapter schema, polling/update policy, eligibility requirements and representative traded token are required? We can implement the agreed adapter and verify that your token-info API and UI return the correct image for a subsequent eligible launch.

Thank you.

## DEX Screener draft

Subject: B20 Launcher on Base — platform token metadata ingestion

Hello DEX Screener team,

We would like to onboard B20 Launcher as a token metadata source on Base (8453), covering future launches through one platform integration. Could you direct this to the appropriate integration channel/team?

Website: https://b20launcher.rakibhq.xyz
Router: 0x24c73392d269ce652203a1d1155422a006809ef1
Public feed: https://b20launcher.rakibhq.xyz/api/tokens?limit=100
Token list: https://b20launcher.rakibhq.xyz/api/tokenlist
Technical specification and launch event: https://github.com/0xmdrakib/B20Launcher/blob/main/docs/token-integrations.md
Sample token: 0xb200000000000000000000D9B4BfBC70F8929C64

The feed exposes confirmed token identity, image URLs, IPFS metadata and deployment transaction provenance without authentication. We can supply a consumer-specific adapter once you confirm its required format. B20 is a token issuer, not a DEX; our current router does not create liquidity pools. The sample is explicitly a logo test with no pair in your token-pairs API at our latest check.

What is your supported process for accepting a launchpad feed or factory/event metadata source? Please specify the schema, refresh rules and market eligibility requirements. Our acceptance test will check a real eligible token's pair/API image and UI, followed by a new token without another individual information submission.

Thank you.

## Uniswap Labs draft

Subject: Base launchpad token information source — B20 Launcher

Hello Uniswap Labs team,

B20 Launcher issues tokens on Base (8453) with EIP-7572 contractURI metadata and IPFS logos. We would like to establish the supported platform-level token information integration for the Uniswap interface, so logos from future B20 launches can be resolved by contract address.

Public Token Lists feed: https://b20launcher.rakibhq.xyz/api/tokenlist
Paginated catalogue: https://b20launcher.rakibhq.xyz/api/tokens?limit=100
Router: 0x24c73392d269ce652203a1d1155422a006809ef1
Documentation: https://github.com/0xmdrakib/B20Launcher/blob/main/docs/token-integrations.md
Sample UI: https://app.uniswap.org/explore/tokens/base/0xb200000000000000000000d9b4bfbc70f8929c64
Sample token and correct logo: https://b20launcher.rakibhq.xyz/token/0xb200000000000000000000D9B4BfBC70F8929C64

The sample is a test asset. We understand that publishing a list does not automatically make it an accepted Uniswap source. We have no evidence of meeting the Launches tab's published trading-volume threshold and are not claiming eligibility for it.

Can you confirm the accepted source-onboarding path for token metadata/logo ingestion on Base, including whether a launchpad feed or an existing downstream data partner should be used? Please route this to the appropriate token data integration team and identify any schema and eligibility requirements.

Thank you.

## MetaMask draft

Subject: Base token metadata source integration — B20 Launcher

Hello MetaMask team,

We maintain B20 Launcher on Base (chain 8453). User-triggered wallet_watchAsset is already implemented with token address, correct decimals and a published HTTPS logo. We also publish a Token Lists feed and would like to understand your supported source-level process for automatic token information discovery across future launches.

Feed: https://b20launcher.rakibhq.xyz/api/tokenlist
Catalogue: https://b20launcher.rakibhq.xyz/api/tokens?limit=100
Documentation: https://github.com/0xmdrakib/B20Launcher/blob/main/docs/token-integrations.md
Sample asset page: https://b20launcher.rakibhq.xyz/token/0xb200000000000000000000D9B4BfBC70F8929C64

Records are keyed by chain and contract address, and only become public after launch receipt and IPFS publication verification. They expose EIP-7572 metadata, HTTPS/IPFS image URIs and transaction provenance. The sample is a test token.

Your contract-metadata repository indicates it is effectively frozen, so we are not submitting per-token PRs or claiming that an arbitrary public list is automatically accepted. Does your token-data service accept platform sources for Base, and what source eligibility, ingestion schema and update rules apply? If it uses another provider for this, please identify the appropriate onboarding route.

Thank you.

## BaseScan draft

Subject category: 1.a. General Inquiry

Hello BaseScan team,

We maintain B20 Launcher, a token issuer on Base, and would like to ask whether BaseScan supports a verified platform metadata feed or bulk issuer integration for token logos and public information across future launches.

Website: https://b20launcher.rakibhq.xyz
Source: https://github.com/0xmdrakib/B20Launcher
Issuance router: 0x24c73392d269ce652203a1d1155422a006809ef1
Token list: https://b20launcher.rakibhq.xyz/api/tokenlist
Public catalogue: https://b20launcher.rakibhq.xyz/api/tokens?limit=100
Integration details: https://github.com/0xmdrakib/B20Launcher/blob/main/docs/token-integrations.md
Representative test asset: 0xb200000000000000000000D9B4BfBC70F8929C64

The feed provides confirmed launch identity, contractURI metadata, HTTPS logo URLs, content hashes and deployment transactions. User wallet ownership and token administration remain non-custodial.

We understand that your normal individual token-info update process requires the official token-update form, contract ownership verification and published source. This inquiry does not request an individual token update through the wrong channel. Does a supported platform/bulk arrangement exist, and if so, what verification, schema and authorization requirements must we meet? If not, please confirm the supported issuer workflow and whether it can cover future factory deployments.

Thank you.

## Acceptance and follow-through

1. Record actual ticket/message URL and submission date after sending. Do not change status to submitted without a receipt.
2. Record each consumer's accepted schema, authentication, scope, refresh contract, eligibility and contact. Implement adapters against that response, not invented write endpoints.
3. Obtain an eligible representative traded token if required. Pool creation, liquidity allocation and trading are separate wallet operations with user-approved assets and amounts; the current test token is not evidence of market eligibility.
4. Run `pnpm check:visibility <address> <output.json>` and inspect actual Uniswap/BaseScan/wallet UI. The script checks publication and real DEX Screener, GeckoTerminal and Blockscout API records. Exit 2 means acceptance is incomplete; resized images require visual review, not automatic failure or success.
5. Verify a subsequent eligible B20 launch appears with the intended logo without submitting another per-token form. Only then record automatic platform ingestion as accepted for that consumer.

No consumer application or code change can promise acceptance by every wallet/explorer. Track the actual supported and verified consumers individually.
