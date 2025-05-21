# Cross-Chain Contract Address Standardization

## Overview

This report outlines the approach for ensuring the PermitAggregator contract is deployed at the **exact same address** across all EVM-compatible chains (Ethereum, Gnosis Chain, etc.).

## Target Contract

- **Address**: `0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e`
- **Network**: Currently exists on Gnosis Chain
- **Contract**: PermitAggregator
- **Status**: Not verified on Gnosisscan

## Cross-Chain Deployment Strategy

To ensure the same contract address across all chains, we need to use one of these deterministic deployment approaches:

### 1. CREATE2 Deployment (Recommended)

The CREATE2 opcode allows deploying contracts to the same address on different chains by using:
- Identical bytecode
- Identical constructor arguments
- Identical salt
- Deploying from the same factory contract address on all chains

**Implementation**:
- We've created a `deploy-deterministic-crosschain.ts` script that:
  - Compiles the contract with consistent settings (Solidity 0.8.20, 200 optimization runs)
  - Calculates the necessary salt to achieve the target address
  - Can deploy to multiple chains using the same parameters
  - Verifies the calculated address matches our target address

**Requirements for CREATE2**:
- A factory contract deployed at the same address on all target chains
- Identical bytecode (same compiler version, same optimization settings)
- Identical constructor arguments (Permit2 address: `0x000000000022D473030F116dDEE9F6B43aC78BA3`)
- Carefully calculated salt value

### 2. Account Abstraction / Deterministic EOAs (Alternative)

For future deployments, smart contract accounts or deterministic EOAs can be used for consistent addresses:
- Generate the same private key for all deployments
- Calculate the nonce required for the target address
- Deploy with that exact nonce on all chains

## Implementation Plan

1. **Verify Existing Contract First**:
   - The `verify-target-gnosis.ts` script attempts automated verification
   - If that fails, follow the manual verification in `manual-verification-guide.md`
   - Understanding the existing contract is crucial before redeploying

2. **Deploy Consistently Across Chains**:
   - Use `deploy-deterministic-crosschain.ts` to find the correct salt
   - Deploy using a CREATE2 factory (like Singleton Factory: `0xce0042B868300000d44A59004Da54A005ffdcf9f`)
   - Deploy with identical parameters on all target chains

3. **Verify Each Deployment**:
   - After each deployment, verify the contract on the respective block explorer
   - Use the same verification settings across all chains

## Advantages of Same-Address Contracts

1. **User Experience**: Users don't need to remember different addresses per chain
2. **Integration Simplicity**: Frontend code can use the same address on all chains
3. **Security**: Reduces risk of pointing to the wrong contract
4. **Efficiency**: Deployment and verification scripts can be reused

## Technical Requirements

To deploy at the target address (`0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e`), you need:

1. **Compiler Settings**:
   - Solidity 0.8.20
   - Optimization enabled with 200 runs

2. **Constructor Arguments**:
   - Permit2 Address: `0x000000000022D473030F116dDEE9F6B43aC78BA3`

3. **CREATE2 Parameters**:
   - Factory address must be the same on all chains
   - Salt will be calculated by `deploy-deterministic-crosschain.ts`

## Testing the Deployment

The script includes functionality to:
1. Calculate the address before deployment
2. Verify it matches the target
3. Check if the contract already exists at the target address

## Common Pitfalls to Avoid

1. **Different Compiler Versions**: Even minor version differences will result in different bytecode
2. **Optimization Differences**: Different optimization settings change the bytecode
3. **Constructor Argument Encoding**: Must be identical across chains
4. **Factory Address**: Must be identical across all chains

## Factory Contract Options

1. **Singleton Factory** (`0xce0042B868300000d44A59004Da54A005ffdcf9f`)
   - Available on most major EVM chains
   - Immutable and standardized

2. **Deterministic Deployment Proxy**
   - Can be deployed at the same address across chains

## Conclusion

Using the CREATE2 deployment method with the scripts provided, you can ensure the PermitAggregator contract is deployed at `0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e` on all EVM chains. This approach standardizes the contract address, simplifying cross-chain integration and improving user experience.
