# Abandoned publication cleanup — September 11, 2026

Confirmed launches are never cleanup candidates. The worker removes only owned annual-plan uploads for an expired, uninitialized launch. New publications have a fixed 24-hour window plus one hour of grace. Retries, uncertain RPC responses, shared live-token references, and unrelated account files are handled as documented in [Storage Lifecycle](../ARCHITECTURE.md#storage-lifecycle).

## Production verification

- Cleanup implementation [`9e84f9b`](https://github.com/0xmdrakib/B20Launcher/commit/9e84f9bc70963f76d1b664a197988277ebd06d8b) passed [CI](https://github.com/0xmdrakib/B20Launcher/actions/runs/34540500015) and [Vercel deployment](https://vercel.com/myhobbyprojects/b20launcher/3eHbKhE2mU5YUMhc5MvGb2a733fJ).
- An ephemeral unfunded wallet authorized a unique test logo/profile. Both real Lighthouse uploads returned the expected CIDs and premium-gateway bytes matched their SHA-256 hashes. No blockchain transaction was sent.
- Only this new test stage's expiry was advanced to exercise abandonment immediately. The [normal authenticated worker](https://github.com/0xmdrakib/B20Launcher/actions/runs/34540645969) removed both matching annual file IDs, verified their absence from the provider inventory, cleared private staged bytes, consumed the stage credential, and retired its discovery job.
- All three previously confirmed token logos returned HTTP 200 and retained their original SHA-256 hashes. [Machine-readable evidence](production-cleanup-verification-20260911.json).
- The same worker exposed an unrelated legacy discovery retry: the deployed Alchemy Free account rejects log ranges wider than ten blocks. The follow-up replaces range scans with native initialization checks and a binary search for the creation block. A read-only test against the configured production provider located block **51054858** in **17** historical state reads and matched transaction **0x7f24447d6cf26ff1b8613a2f7e29b2ab69abbd94aad49e8dd6fb2dd9aa270d29** using one block of logs. See [Alchemy's documented block-range limits](https://www.alchemy.com/docs/chains/stable/stable-api-endpoints/eth-get-logs).
- Public status responses now omit server RPC URLs. Provider credentials belong only in the server environment.

Local checks cover 58 API tests, five shared-library tests, 20 web tests, and the isolated PostgreSQL integration test. Database checks exercised idempotent migration, concurrent worker claims, cross-connection publication locks, immutable expiry, cleanup fencing and receipt recovery. Solidity was unchanged; Base Foundry is not installed locally, so its wrapper skips contract checks.

The earlier publication fixture used legacy generic filenames. This release does not assume ownership of those files or delete existing account content by CID. Its original retention remains recorded in the previous release note. Public IPFS copies outside the Lighthouse account cannot be recalled by an account-file deletion.

Consumer ingestion status is separate: [submitted applications](submission-status.md) do not establish that external wallets/DEXs have subscribed to the feed.
