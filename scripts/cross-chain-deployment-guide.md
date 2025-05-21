# Cross-Chain Deployment Guide for PermitAggregator

This guide outlines how to deploy the PermitAggregator contract to the same address on multiple EVM-compatible blockchains.

## Target Information

- **Contract**: PermitAggregator
- **Target Address**: `0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e`
- **Status**: Currently not deployed on any major EVM chain

## Current Findings

We've verified through `scripts/check-all-chains.ts` that the target address `0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e` does not currently contain deployed contract bytecode on any of these chains:

- Ethereum Mainnet
- Gnosis Chain
- Optimism
- Arbitrum One
- Polygon
- BSC
- Avalanche
- Base
- zkSync Era
- And other EVM chains

## CREATE2 Deployment Strategy

To deploy the contract to the same address on all chains, we need to use the CREATE2 opcode with:

1. A factory contract that exists at the same address on all chains
2. Identical bytecode (compiler version + optimization settings)
3. Identical constructor arguments
4. The same salt value

## Requirements

- **Singleton Factory**: Use the EIP-2470 Singleton Factory [`0xce0042B868300000d44A59004Da54A005ffdcf9f`](https://eips.ethereum.org/EIPS/eip-2470) which exists at the same address on all major EVM chains
- **Compiler Settings**: Solidity 0.8.20 with 200 optimization runs
- **Constructor Argument**: Permit2 Address (`0x000000000022D473030F116dDEE9F6B43aC78BA3`)
- **Salt Value**: A 32-byte value that must be calculated specifically to deploy to our target address

## Salt Calculation

The salt value needs to be calculated such that the resulting address equals our target. This is done through:

```
CREATE2_address = keccak256(0xff + factory_address + salt + keccak256(init_code))[12:]
```

We've created two scripts to calculate this salt:
- `scripts/find-salt-for-target.ts`: A demo script showing the approach (limited to 1000 iterations)
- `scripts/deploy-deterministic-crosschain.ts`: A more comprehensive script for production use

Finding the right salt might require significant computational effort (potentially millions or billions of iterations). For production use, this would need to run on a powerful machine over a longer period.

## Step-by-Step Deployment Process

1. **Calculate the Salt**:
   ```
   # Install required dependencies
   bun add viem solc

   # Run the salt finder script (extended version with more iterations)
   bun run scripts/deploy-deterministic-crosschain.ts
   ```

2. **Deploy Using the Singleton Factory**:
   Once you have the salt, deploy using the Singleton Factory contract on each chain. A standard approach is to call:

   ```solidity
   function deploy(bytes memory _initCode, bytes32 _salt) public returns (address payable createdContract)
   ```

   This can be done using scripts in this repository once the salt is identified.

3. **Verify on Block Explorers**:
   After deployment, verify the contract on each chain's block explorer using identical compiler settings.

## Future Improvements

- Extend the salt search algorithm to be more efficient
- Add multi-threading support for faster salt finding
- Create a web interface for monitoring deployment status across chains

## Conclusion

While we haven't yet found the exact salt value to deploy to `0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e`, we've set up all the tooling and infrastructure required to do so. Finding the salt is primarily a computational task that requires more extensive search.

With the correct salt, the PermitAggregator contract can be deployed to the exact same address on all EVM chains, significantly improving cross-chain UX and security.
