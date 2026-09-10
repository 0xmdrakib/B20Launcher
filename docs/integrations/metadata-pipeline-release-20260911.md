# Metadata pipeline release — September 11, 2026

Implementation: [`1793197`](https://github.com/0xmdrakib/B20Launcher/commit/1793197986994881bbfc8a14844ff907a8530dc7).

- [Vercel production deployment](https://vercel.com/myhobbyprojects/b20launcher/8STyJvxrJuoZpKikN6Phdbx4Ezzx): successful; production manifest reports version `0.2.0`.
- [GitHub CI](https://github.com/0xmdrakib/B20Launcher/actions/runs/34537707480): successful. Local verification passed 66 unit tests and one opt-in PostgreSQL integration test on an isolated Neon branch. No Solidity code changed; the local Base Foundry wrapper skipped contract checks because Base Foundry is not installed.
- [First authenticated worker run](https://github.com/0xmdrakib/B20Launcher/actions/runs/34537880399): successful. It processed four jobs with zero failures, zero retrying jobs, and zero stalled jobs. Three jobs reconciled deployed tokens; one checked the unlaunched publication fixture.
- All three existing tokens now report `metadataSource: "onchain-contractURI"`, with production revisions `1`, `2`, and `3`. Their onchain names, symbols, current profiles and PNG hashes were verified.
- [Public changes feed](https://b20launcher.rakibhq.xyz/api/tokens/changes?after=0): three changes, `nextCursor: 3`, `hasMore: false`, cross-origin reads enabled. A conditional request returned `304`.
- [Token list](https://b20launcher.rakibhq.xyz/api/tokenlist): HTTP `200`, three tokens, version `1.3.0`.
- An unauthenticated worker request returned `401`. A genuine short-lived GitHub OIDC identity from the pinned main-branch workflow was accepted.
- A production publication test used an ephemeral, unfunded wallet to sign the exact approval. Real Lighthouse uploads reached `ready` and independent downloads from the premium gateway returned `200` with matching hashes for both assets. No blockchain transaction was sent, and lookup of the unlaunched predicted token returned `404`. The temporary publication fixture follows the normal 30-day abandoned-stage retention policy; its approved IPFS files remain public.

Evidence: [isolated database/onchain verification](indexer-verification-20260911.json), [live publication verification](production-publication-verification-20260911.json).

The publication and indexing service is operational. Consumer subscriptions/partner acceptance are tracked separately in [submission status](submission-status.md); these checks do not claim that an external wallet or DEX has adopted the feed. Pool development remains deferred to the owner's separate plan.
