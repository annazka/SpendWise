# SpendWise

**Scan receipts. Track spending. Stay in control.**

SpendWise is a wallet-connected, multi-currency expense tracker built for BOT Chain. One wallet can manage four independent Currency Accounts: IDR, USD, MYR, and SGD.

Each Currency Account has its own expense history and optional budget. This is real separation, not a cosmetic currency converter. Users can record expenses without setting a budget, then enable a spending limit whenever they need one.

## Main flow

1. Connect a MetaMask-compatible wallet and sign a free login message.
2. Choose an IDR, USD, MYR, or SGD Currency Account.
3. Scan a receipt with Veryfi AI. Manual entry is disabled.
4. Veryfi validates the document and extracts merchant, date, amount, currency, and category.
5. Optionally set a budget and date range.
6. Record the expense on BOT Chain when the contract is configured.

## Current MVP

- English interface.
- Wallet connection and free signature login.
- Four separated Currency Accounts.
- Optional budgets.
- Receipt-only expense entry. Users cannot type or edit expense data manually.
- Veryfi receipt validation and extraction through a protected Vercel server route.
- `VALIDATING`, `APPROVED`, and `REJECTED` validation states.
- Local and provider duplicate checks plus receipt SHA-256 hashing.
- BOT Chain smart-contract integration.
- Responsive dashboard and transaction history.

For this hackathon MVP, budgets and expense history are stored in the browser and separated by wallet address and currency. Clearing browser storage or using another device creates a fresh local history. Confirmed on-chain records remain available through the BOT Chain explorer.

## Technology

- Next.js App Router
- React and TypeScript
- Vercel serverless route for receipt scanning
- Veryfi Data Extraction API
- ethers v6 and MetaMask
- Solidity 0.8.20
- Local browser storage for the hackathon MVP

## Local development

```bash
pnpm install
pnpm dev
```

Create `.env.local` based on `.env.example`.

```text
VERYFI_CLIENT_ID=
VERYFI_USERNAME=
VERYFI_API_KEY=
NEXT_PUBLIC_AI_ENABLED=true
NEXT_PUBLIC_BOT_CHAIN_ID=968
NEXT_PUBLIC_BOT_CONTRACT_ADDRESS=
NEXT_PUBLIC_BOT_RPC=https://rpc.bohr.life
NEXT_PUBLIC_BOT_EXPLORER=https://scan.bohr.life
```

Never commit API keys, private keys, or seed phrases.

## Vercel deployment

1. Import this GitHub repository into Vercel.
2. Keep Framework Preset on **Next.js**.
3. Keep Root Directory as `./`.
4. Keep Build Command as `next build` or the automatic default.
5. Add the environment variables from `.env.example` in Vercel Project Settings.
6. Deploy the project.
7. Attach `spend-wise.my.id` in Vercel Domains.

Every push to the connected `main` branch triggers a new Vercel deployment.

## Smart contract

The contract is available at `contracts/SpendWiseProof.sol`. It stores an immutable proof containing the wallet, amount in minor units, currency, date, and a hash of the expense details. It does not store the receipt image.

Compile it with:

```bash
node scripts/compile-contract.mjs
```

## Deployment addresses

| Network | Chain ID | Contract address |
| --- | ---: | --- |
| BOT Chain Testnet | 968 | Not deployed yet |
| BOT Chain Mainnet | 677 | Not deployed yet |

Always test on BOT Chain Testnet before deploying to mainnet.

## Hackathon checklist

- [ ] Add the three `VERYFI_*` credentials to Vercel and test several receipts.
- [ ] Deploy the contract to BOT Chain Testnet.
- [ ] Add the testnet address to Vercel and this README.
- [ ] Test wallet connection and expense recording end to end.
- [ ] Request the organizer's BOT mainnet allocation.
- [ ] Deploy the contract to BOT Chain Mainnet.
- [ ] Change the public chain configuration to mainnet.
- [ ] Confirm `spend-wise.my.id` is active.
- [ ] Publish the required X posts and mainnet launch announcement.

SpendWise is built for the Girl Meets Tech Build Week Hackathon Vol. 2 on BOT Chain.
