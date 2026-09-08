# Base B20 identity and logo audit

Checked 2026-09-09 (Asia/Dhaka) against the two launches shown as `Unknown (Unknown)` in the owner's EtherDrops screenshot. This report checks token identity separately from images, market discovery, and consumer acceptance.

## Result

Both launches contain the correct name and symbol in the official factory's `B20Created` event. Current ERC-20 calls return the same names/symbols, both tokens are initialized B20 assets, and both IPFS metadata documents and logos are retrievable with matching identity and image hashes. No missing name, symbol, contract URI, or malformed logo was found in these two launches.

The screenshot establishes that EtherDrops detected the zero-address mint and displayed the correct amounts while failing to display token identity. It does not establish which internal EtherDrops lookup failed. B20 recognition, RPC/provider handling, and negative metadata caching are hypotheses for its maintainers to investigate, not confirmed details of its implementation.

## Evidence

| Check | First launch | Repeated launch |
| --- | --- | --- |
| Token | `0xb200000000000000000000D9B4BfBC70F8929C64` | `0xB200000000000000000000aAfB51E3727b78856B` |
| Name from `B20Created` and current `name()` | B20 Logo Test | B20 Logo Test 2 |
| Symbol from `B20Created` and current `symbol()` | B20TEST | B20TEST |
| Decimals from event and current call | 18 | 18 |
| Mint from zero address | 1,000 | 10,000 |
| Successful launch block | 51054858 | 51055378 |
| `isB20Initialized(address)` | true | true |
| `eth_getCode` | `0xef` | `0xef` |
| `ContractURIUpdated()` in launch receipt | Present | Present |
| Metadata JSON | HTTP 200, application/json | HTTP 200, application/json |
| Image | HTTP 200, image/png, 512 x 512, 4,565 bytes | Same image |

Transactions:

- [First launch](https://basescan.org/tx/0x7f24447d6cf26ff1b8613a2f7e29b2ab69abbd94aad49e8dd6fb2dd9aa270d29)
- [Repeated launch](https://basescan.org/tx/0xd9c0e723870b5cbbc3836f9cddba01dd95fa88a35c4bebfdae4d2ea570c4b21b)

Logo SHA-256: `36a709228ab90e0010e60548b053f6a9d75eff13d3e2676dfaa19b3247c06a4c`. The two documents have different metadata CIDs and the same image CID, as expected when a second named token reuses the same logo.

The [machine-readable observations](base-logo-identity-audit.json) include raw decoded factory/mint events, current reads, metadata bodies, MIME types, image dimensions, and hash comparisons. Latest reads used Base's public RPC and PublicNode. Some historical calls were rejected by public RPC archive limits; those failures are recorded as unavailable, not passed. Creation-time identity is independently established by the decoded `B20Created` receipts. Recorded publication timestamps are not measurements of the first moment an external gateway could serve a CID.

## Comparison with Base guidance

- Base specifies `contractURI()` for offchain token metadata using ERC-7572. Our router includes `updateContractURI` in the factory's creation-time `initCalls`, and the native token emits `ContractURIUpdated()`. [Base specification](https://docs.base.org/specifications/b20/specification-overview#contract-uri-erc-7572), [IB20 reference](https://docs.base.org/specifications/b20/reference/interfaces/ib20).
- ERC-7572 defines a JSON `name` and an optional `image` URI resolving to `image/*`; its example uses IPFS. The two live documents match those fields and their onchain identity. The 512 x 512 normalization is our implementation choice, not a mandatory Base logo size. [ERC-7572 schema](https://eips.ethereum.org/EIPS/eip-7572#schema-for-contracturi).
- Base's asset-creation guide uses the same versioned name/symbol/admin/decimals tuple, `createB20`, and `B20Created` receipt decoding. [Create an Asset Token](https://docs.base.org/build-on-base/issue-rwa/create-an-asset-token).
- A B20 token is a native precompile with the `0xef` code stub, not a conventional ERC-20 bytecode deployment. Base documents the stub and the `isB20Initialized` check. A consumer that requires ordinary bytecode selectors, a Solidity deployment trace, or explorer source recognition before reading identity can miss B20 tokens. Whether EtherDrops uses such a check remains unconfirmed. [Base architecture at audited revision](https://github.com/base/base-std/blob/be6d0450890e20fc4a739aeaff5e839f234d12a6/docs/architecture.md#2-how-a-token-is-created).
- `Transfer(address(0), recipient, amount)` represents minting. The bot's `Null Address` label agrees with the actual mint logs. Pool creation is not required for `name()` or `symbol()` to return these values. [IB20 mint reference](https://docs.base.org/specifications/b20/reference/interfaces/ib20).

## Limits

Basic identity can be obtained directly from Base without onboarding our custom token feed. Consumers choosing our feed can also use the existing public API.

No contract mutation, new launch, paid listing, liquidity operation, or support message to EtherDrops was performed during this audit. The five earlier onboarding inquiries remain separate submissions. Neither a source-format pass nor an onboarding receipt proves consumer logo display.

Our publication flow uploads to Lighthouse after receipt verification. A consumer fetching the URI immediately from the launch event may need to retry until publication finishes. The current browser-driven commit and lack of reconciliation for later external metadata changes are publication-reliability limits already described in the integration guide; neither is established as the cause of this screenshot's missing name/symbol. This audit does not silently remove the receipt gate or expose paid storage uploads to anonymous callers.
