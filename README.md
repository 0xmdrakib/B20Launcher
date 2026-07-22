# B20 Launcher

B20 Launcher is a non-custodial issuer platform for launching Base-native B20 assets and stablecoins from a human interface or an x402 agent API.

**Live app:** https://b20launcher.rakibhq.xyz

---

## Overview

B20 Launcher is built for two core flows:

- **Human issuers:** Configure identity, supply, roles, policies, and launch safety from a guided four-step interface.
- **Autonomous agents:** Request validated unsigned transaction packages through an x402-protected API while keeping signing and submission inside the agent wallet.

The app focuses on transparent issuance. It shows the predicted token address, exact initial mint, configured roles, metadata state, gas estimate, and final calldata before the issuer signs.

## Features

- Launch Base B20 `ASSET` and `STABLECOIN` variants
- Deterministic token address prediction
- Default 1 billion maximum supply with editable initial issuance
- Initial mint defaults to 50% of maximum supply
- Optional minter, metadata, pause, burn, and asset operator roles
- Sender, receiver, and mint-receiver policy configuration
- Pause transfer, mint, or burn operations at launch
- PNG, JPEG, and WebP token logos up to 1 MB
- ERC-7572 contract metadata published through Lighthouse IPFS
- Private metadata staging before transaction submission
- Automatic cleanup for expired or abandoned staging data
- Base Builder Code attribution inside generated transaction calldata
- Non-custodial wallet signing with no platform launch fee
- Responsive desktop, tablet, and mobile issuer interface
- x402 agent manifest and unsigned transaction builder

## Supported network

- Base Mainnet (`8453`)

## Launch behavior

### Metadata and logo

- The selected logo is validated and normalized before staging.
- Logos larger than 1 MB are rejected.
- Staged files are not published to Lighthouse immediately.
- Publication happens only after the matching Base launch transaction is submitted and verified.
- Abandoned drafts do not consume permanent project IPFS storage.

### Supply and permissions

- New launches default to a 1 billion maximum supply and minting 50% (500 million).
- The issuer can change the initial mint and recipient before signing.
- Leaving the initial recipient empty uses the connected wallet or custom token admin.
- Optional operational roles and PolicyRegistry IDs are encoded into the same atomic launch transaction.

### Transaction execution

- Token creation uses Base's native B20 factory through `B20LaunchRouter`.
- The platform does not store private keys or submit transactions for users.
- The issuer reviews and signs one Base Mainnet transaction from their wallet.
- Generated human and x402 transaction data includes Builder Code attribution.

## Tech stack

- Next.js 16
- React 19
- TypeScript
- wagmi
- viem
- Next.js Route Handlers
- Express compatibility adapter
- Zod
- Lighthouse IPFS
- Neon Postgres
- x402
- Base Foundry
- Vitest
- Playwright

---

## License

This project is licensed under the [MIT License](./LICENSE).
