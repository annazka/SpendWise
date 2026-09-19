# SpendWise

**Scan receipts. Track spending. Stay in control.**

SpendWise is a wallet-connected, multi-currency expense tracker built for BOT Chain. One user connects one wallet, then manages four independent Currency Accounts: IDR, USD, MYR, and SGD.

Each Currency Account keeps its own expenses, history, and optional budget. This is real data separation—not a cosmetic currency converter. A user can track daily spending without setting a budget, or enable a budget when they want a spending limit.

## Core experience

1. Connect a MetaMask-compatible wallet and sign a free authentication message. Signing in does not cost gas.
2. Choose an IDR, USD, MYR, or SGD Currency Account.
3. Scan a receipt with AI or enter an expense manually.
4. Review the extracted merchant, date, amount, and category before saving.
5. Optionally set a budget and date range to see remaining funds and spending progress.
6. Switch Currency Accounts at any time. Their budgets and transaction histories stay separate.
7. When a BOT Chain contract address is configured, every saved expense can also create an immutable on-chain proof.

## Why it matters

People who travel, study abroad, freelance internationally, or earn and spend in different currencies should not have unrelated expenses mixed together. SpendWise gives one wallet a clean financial context for each currency while keeping access simple.

## Current status

This repository contains the working MVP. Wallet authentication, four Currency Accounts, optional budgets, manual expense entry, isolated histories, dashboard summaries, receipt upload UI, AI receipt extraction endpoint, and BOT Chain transaction integration are implemented.

AI scanning requires a server-side OpenAI API key. On-chain recording requires a deployed `SpendWiseProof` contract address. If no contract is configured, expenses are still saved and clearly labeled **Local only**. No testnet or mainnet deployment is claimed yet.

## Data and privacy

- Financial records are scoped to the authenticated wallet address.
- Login uses a nonce-based wallet signature and an HttpOnly session cookie. The authentication signature is free and is not a blockchain transaction.
- Receipt images are sent to the configured AI provider only when the user chooses to scan; SpendWise does not store the uploaded image.
- AI results must be reviewed before saving.
- The scan endpoint currently allows 20 scans per wallet per UTC day.
- Currency Accounts do not perform exchange-rate conversion. An IDR expense remains IDR, and a USD expense remains USD.
- On-chain records contain the wallet, amount in minor units, currency code, date, and a hash of the expense details. They do not contain the receipt image.

## Stack

- React, TypeScript, and Vinext
- Cloudflare Workers and D1
- Drizzle ORM and SQL migrations
- ethers v6 and MetaMask-compatible wallets
- Solidity 0.8.20
- OpenAI image input for receipt extraction

The full website interface is in English.

## Local development

Copy `.env.example` to `.env` and configure the required values. Never commit private keys, seed phrases, or API keys.

```bash
pnpm install
pnpm db:generate
pnpm build
```

Important environment variables:

- `OPENAI_API_KEY`: enables AI receipt extraction.
- `OPENAI_MODEL`: defaults to `gpt-4.1-mini`; the model must support image input and JSON output.
- `BOT_CHAIN_ID`: `968` for testnet or `677` for mainnet.
- `BOT_CONTRACT_ADDRESS`: deployed `SpendWiseProof` address for the selected network.

This is a full-stack app with server routes and D1 persistence, so it cannot run as a static GitHub Pages site. Deploy it to a platform that supports its Worker backend.

## Smart contract

The contract is in `contracts/SpendWiseProof.sol`. It stores an immutable expense proof for each wallet and expense ID. It accepts no deposits, has no owner privileges, and rejects duplicate expense IDs.

Compile and validate it with:

```bash
node scripts/compile-contract.mjs
```

The command writes the ABI and bytecode to `artifacts/SpendWiseProof.json`.

## Deployment

| Network | Chain ID | Contract address |
| --- | ---: | --- |
| BOT Chain Testnet | 968 | Not deployed yet |
| BOT Chain Mainnet | 677 | Not deployed yet |

Network details from the hackathon guidebook:

- Testnet RPC: https://rpc.bohr.life
- Testnet explorer: https://scan.bohr.life
- Testnet faucet: https://faucet.botchain.ai/basic
- Mainnet RPC: https://rpc.botchain.ai
- Mainnet explorer: https://scan.botchain.ai

Always deploy and test on BOT Chain Testnet first. After the complete flow works, request the organizer's BOT mainnet token allocation, deploy to mainnet, and replace the placeholders above with the real contract addresses.

## Hackathon completion checklist

- [ ] Configure and test real AI receipt extraction with several receipt formats.
- [ ] Deploy and test `SpendWiseProof` on BOT Chain Testnet.
- [ ] Add the testnet contract address to the app and README.
- [ ] Request the organizer's BOT mainnet token allocation.
- [ ] Deploy and test on BOT Chain Mainnet.
- [ ] Add the mainnet contract address to the app and README.
- [ ] Point the final domain to the deployed application.
- [ ] Publish a dedicated project X account and at least five valid posts.
- [ ] Publish the official BOT Chain Mainnet launch announcement.
- [ ] Submit every required item before the hackathon deadline.

## Project identity

SpendWise is built for the Girl Meets Tech Build Week Hackathon Vol. 2 on BOT Chain.
