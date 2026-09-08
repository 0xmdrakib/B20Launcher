# EtherDrops B20 identity reproduction

Status: **prepared; not sent**. This is a token-identity bug report, separate from the five existing consumer onboarding inquiries.

Subject: Base native B20 mints display Unknown despite correct onchain name and symbol

Hello Drops support team,

Two Base Mainnet (chain 8453) native B20 launches are shown in your wallet alerts as `Unknown (Unknown)`. The addresses and received amounts are correct. The source is the zero address because these transactions mint the initial supply.

1. B20 Logo Test / B20TEST, 18 decimals, 1,000 minted:
   - Token: `0xb200000000000000000000D9B4BfBC70F8929C64`
   - Transaction: `0x7f24447d6cf26ff1b8613a2f7e29b2ab69abbd94aad49e8dd6fb2dd9aa270d29`
   - Block: 51054858, 2026-09-08 20:24:23 UTC.
2. B20 Logo Test 2 / B20TEST, 18 decimals, 10,000 minted:
   - Token: `0xB200000000000000000000aAfB51E3727b78856B`
   - Transaction: `0xd9c0e723870b5cbbc3836f9cddba01dd95fa88a35c4bebfdae4d2ea570c4b21b`
   - Block: 51055378, 2026-09-08 20:41:43 UTC.

For each token, the factory at `0xB20f000000000000000000000000000000000000` emitted `B20Created` with the name, symbol and decimals above. The current standard `name()` (`0x06fdde03`), `symbol()` (`0x95d89b41`) and `decimals()` (`0x313ce567`) calls also return those fields. `isB20Initialized(address)` returns true.

These tokens return `0xef` from `eth_getCode`. That is Base's documented native B20 marker; they do not contain conventional ERC-20 Solidity bytecode. Please check whether your resolver filters them out before making ERC-20 calls, whether your provider handles native B20 calls, or whether an initial missing lookup has been negatively cached. We cannot determine your internal failure path from the alerts alone.

Both tokens also have ERC-7572 `contractURI()` metadata and `ContractURIUpdated()` events. The metadata JSON and 512 x 512 PNG logo return HTTP 200. Full observations and official references:

https://github.com/0xmdrakib/B20Launcher/blob/main/docs/integrations/base-logo-identity-audit.md

Can you refresh these records, identify the failed identity lookup, and confirm that future native B20 mint alerts resolve names and symbols automatically? Correct name/symbol resolution should not depend on a separate per-token profile application. Please also advise whether you read ERC-7572 images or require a separate supported metadata source for logos.

Thank you,
Md. Rakib
