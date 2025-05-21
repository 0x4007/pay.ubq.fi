# Cross-Chain Deployment Guide

This guide explains how to deploy the PermitAggregator contract to multiple chains using our deployment scripts.

## Prerequisites

1. **Private Key**: You need a private key with funds on each target chain
2. **API Keys**: For verification, you need API keys for each block explorer

## Setup

1. **Update the .env file with your actual private key**:

   ```bash
   # Example of how your private key should look (do NOT use this one!)
   DEPLOYER_PRIVATE_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
   ```

   The `DEPLOYER_PRIVATE_KEY` should be:
   - The actual private key of an account you control
   - Should NOT include the 0x prefix
   - Must be 64 hex characters (32 bytes)
   - MUST have funds on each chain you're deploying to (ETH on Ethereum, xDAI on Gnosis, etc.)

2. **Update the API keys** for each block explorer to enable verification:

   ```bash
   ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
   GNOSISSCAN_API_KEY=YOUR_GNOSISSCAN_API_KEY
   OPTIMISTIC_ETHERSCAN_API_KEY=YOUR_OPTIMISTIC_ETHERSCAN_API_KEY
   ```

## Deployment Process

### 1. Deploy to Gnosis Chain

```bash
CHAIN_ID=100 VERIFY_CHAIN=gnosis bun run scripts/deploy-to-chain.ts
```

### 2. Deploy to Ethereum Mainnet

```bash
CHAIN_ID=1 VERIFY_CHAIN=ethereum bun run scripts/deploy-to-chain.ts
```

### 3. Deploy to Optimism

```bash
CHAIN_ID=10 VERIFY_CHAIN=optimism bun run scripts/deploy-to-chain.ts
```

### 4. Verify on Each Chain (after deployment is confirmed)

```bash
VERIFY_CHAIN=gnosis bun run scripts/verify-contract-code.ts
VERIFY_CHAIN=ethereum bun run scripts/verify-contract-code.ts
VERIFY_CHAIN=optimism bun run scripts/verify-contract-code.ts
```

## Target Address

The contract will be deployed to: `0x17e04Bcb99c389986A3d7E336aACE8F2a1538CD5` on all chains.

## Important Notes

1. Each deployment transaction will use a different amount of gas depending on the chain
2. Wait for each transaction to be confirmed before moving to the next chain
3. Verification can only be done after the contract is deployed and confirmed
4. The initial salt is generated randomly - if you want to redeploy with the same address later, save the salt value from the console output and add it to your .env file

## Troubleshooting

- **Invalid Private Key Error**: Make sure your private key is in the correct format (64 hex chars without 0x prefix)
- **Insufficient Funds**: Ensure your account has enough native tokens on each chain
- **Verification Failures**: Double check your API keys and wait for the contract to be fully deployed
