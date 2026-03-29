# Solana Crowdfunding

A crowdfunding smart contract built on Solana with [Anchor](https://www.anchor-lang.com/).

The program lets a creator open a campaign with a funding goal and deadline, allows other wallets to contribute SOL, and supports two end states:

- The creator withdraws funds after the deadline if the goal is reached.
- Contributors claim refunds after the deadline if the goal is not reached.

## Overview

This repository contains:

- An Anchor program in `programs/solana-crowdfunding`
- TypeScript integration tests in `tests/solana-crowdfunding.ts`
- Anchor workspace configuration in `Anchor.toml`

## Features

- Create a campaign with a unique `id`, funding goal, and deadline
- Contribute SOL to an active campaign
- Withdraw campaign funds as the creator after a successful campaign
- Refund contributors after an unsuccessful campaign
- Track per-contributor balances for refund eligibility
- Use PDAs for campaign state, vault, and contribution records

## Program Flow

### 1. Create campaign

The creator initializes a campaign account and its related vault PDA.

Validation:

- `goal` must be greater than `0`
- `deadline` must be in the future

### 2. Contribute

Contributors transfer lamports into the campaign vault before the deadline.

Validation:

- Campaign must still be active
- Contribution amount must be greater than `0`

### 3. Withdraw

After the deadline, the creator can withdraw all vault funds if the campaign met its goal.

Validation:

- Deadline must already pass
- Campaign must reach its goal
- Funds must not have been claimed before
- Caller must be the campaign creator

### 4. Refund

After the deadline, a contributor can reclaim their recorded contribution if the campaign did not reach its goal.

Validation:

- Deadline must already pass
- Campaign goal must not be reached
- Contributor must have a refundable balance

## Accounts

### `Campaign`

Stores:

- Campaign `id`
- Creator public key
- Funding goal
- Total raised amount
- Deadline timestamp
- Claim status
- PDA bumps

### `Contribution`

Stores:

- Campaign public key
- Donor public key
- Total donated amount by that donor
- PDA bump

### Vault PDA

A PDA-owned system account that temporarily holds contributed SOL until withdrawal or refund.

## Project Structure

```text
.
|-- Anchor.toml
|-- Cargo.toml
|-- package.json
|-- programs/
|   `-- solana-crowdfunding/
|       `-- src/
|-- tests/
|   `-- solana-crowdfunding.ts
`-- migrations/
```

## Prerequisites

Install these tools before working with the project:

- Rust
- Solana CLI
- Anchor CLI `0.32.1`
- Node.js
- Yarn

## Getting Started

### 1. Install dependencies

```bash
yarn install
```

### 2. Configure Solana for local development

```bash
solana config set --url localhost
```

If needed, create a local wallet:

```bash
solana-keygen new -o ~/.config/solana/id.json
```

### 3. Build the program

```bash
anchor build
```

### 4. Run tests

```bash
anchor test
```

The integration test suite covers:

- Campaign creation validation
- Contributions before and after deadline
- Successful withdrawal flow
- Unauthorized withdrawal attempts
- Refund flow for unsuccessful campaigns
- Double-refund prevention
- Vault dust handling during refund

## Local Development

To work manually with a local validator:

1. Start the validator:

```bash
solana-test-validator
```

2. In another terminal, build or deploy as needed:

```bash
anchor build
anchor deploy
```

3. Run tests:

```bash
anchor test
```

## Deploy to Devnet

1. Switch the Solana CLI to devnet:

```bash
solana config set --url devnet
```

2. Fund the deployer wallet if needed:

```bash
solana airdrop 2
```

3. Build the program:

```bash
anchor build
```

4. Deploy the program:

```bash
anchor deploy --provider.cluster devnet
```

The deploy command uses the wallet configured in `Anchor.toml`:

```text
~/.config/solana/id.json
```

If the deployed program ID changes, update it consistently before interacting with the new deployment:

- `Anchor.toml`
- `programs/solana-crowdfunding/src/lib.rs`

## PDA Seeds

The program derives accounts with these seeds:

- Campaign: `["campaign", creator, campaign_id]`
- Vault: `["vault", campaign]`
- Contribution: `["contribution", campaign, contributor]`

## Current Program ID

The current program ID configured in this repository is:

```text
H4jTQeirHZCXyZuJ5JkMVXQ5mmKKqHQxFkeTrUMzta9K
```

This value is currently used for local development in `Anchor.toml`. If you deploy a separate build to devnet with a different program keypair, keep the IDs in sync where required.

If you regenerate or redeploy with a different keypair, update the program ID consistently in:

- `Anchor.toml`
- `programs/solana-crowdfunding/src/lib.rs`

## Notes

- Contribution amounts are stored per contributor and accumulated across multiple donations.
- Withdraw transfers the full vault balance to the creator once the campaign succeeds.
- Refund sets the contributor's recorded amount to `0` after payout.
- This repository currently contains the on-chain program and tests only. No maintained frontend is included.

## License

This project is currently marked with the `ISC` license in `package.json`.
