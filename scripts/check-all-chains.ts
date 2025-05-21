/**
 * Comprehensive Chain Scanner for Contract Address
 *
 * This script checks for the existence of a contract across multiple EVM-compatible
 * chains to determine where a specific contract address is deployed.
 */

import axios from "axios";

// Target contract address
const TARGET_ADDRESS = "0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e";

// Chain definitions with their RPC URLs
const CHAINS = [
  // Major chains
  { name: "Ethereum Mainnet", id: 1, rpc: "https://rpc.ubq.fi/1" },
  { name: "Gnosis Chain", id: 100, rpc: "https://rpc.gnosischain.com" }, // Using native RPC as backup
  { name: "Optimism", id: 10, rpc: "https://rpc.ubq.fi/10" },
  { name: "Arbitrum One", id: 42161, rpc: "https://rpc.ubq.fi/42161" },
  { name: "Polygon", id: 137, rpc: "https://rpc.ubq.fi/137" },

  // Additional chains
  { name: "BSC", id: 56, rpc: "https://bsc-dataseed.binance.org" },
  { name: "Avalanche", id: 43114, rpc: "https://api.avax.network/ext/bc/C/rpc" },
  { name: "Base", id: 8453, rpc: "https://mainnet.base.org" },
  { name: "zkSync Era", id: 324, rpc: "https://mainnet.era.zksync.io" },
  { name: "Fantom", id: 250, rpc: "https://rpc.ftm.tools" },
  { name: "Celo", id: 42220, rpc: "https://forno.celo.org" },
  { name: "Harmony", id: 1666600000, rpc: "https://api.harmony.one" },
  { name: "Moonbeam", id: 1284, rpc: "https://rpc.api.moonbeam.network" },
  { name: "Moonriver", id: 1285, rpc: "https://rpc.api.moonriver.moonbeam.network" },

  // Testnets
  { name: "Sepolia", id: 11155111, rpc: "https://rpc.sepolia.org" },
  { name: "Goerli", id: 5, rpc: "https://rpc.goerli.mudit.blog" }
];

/**
 * Check if a contract exists at the target address on a specific chain
 */
async function checkContractOnChain(chain: { name: string; id: number; rpc: string }) {
  try {
    console.log(`Checking ${chain.name} (Chain ID: ${chain.id})...`);

    const response = await axios.post(
      chain.rpc,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [TARGET_ADDRESS, "latest"]
      },
      {
        timeout: 5000, // 5 second timeout to prevent hanging on slow RPCs
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    if (response.data.error) {
      console.log(`  Error: ${response.data.error.message}`);
      return false;
    }

    const bytecode = response.data.result;

    if (!bytecode || bytecode === "0x") {
      console.log(`  No contract at this address`);
      return false;
    } else {
      console.log(`  ✅ CONTRACT FOUND! Bytecode length: ${bytecode.length} characters`);

      // Get balance
      const balanceResponse = await axios.post(
        chain.rpc,
        {
          jsonrpc: "2.0",
          id: 2,
          method: "eth_getBalance",
          params: [TARGET_ADDRESS, "latest"]
        },
        {
          timeout: 5000,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      if (!balanceResponse.data.error) {
        const balance = parseInt(balanceResponse.data.result, 16) / 1e18;
        console.log(`  Contract balance: ${balance} ETH/native tokens`);
      }

      return true;
    }
  } catch (error) {
    console.log(`  ⚠️ Network error: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Get block explorer URL for a chain
 */
function getExplorerUrl(chainId: number) {
  const explorers: Record<number, string> = {
    1: "https://etherscan.io",
    10: "https://optimistic.etherscan.io",
    56: "https://bscscan.com",
    100: "https://gnosisscan.io",
    137: "https://polygonscan.com",
    250: "https://ftmscan.com",
    324: "https://explorer.zksync.io",
    1284: "https://moonbeam.moonscan.io",
    1285: "https://moonriver.moonscan.io",
    8453: "https://basescan.org",
    42161: "https://arbiscan.io",
    42220: "https://explorer.celo.org",
    43114: "https://snowtrace.io",
    1666600000: "https://explorer.harmony.one",
    5: "https://goerli.etherscan.io",
    11155111: "https://sepolia.etherscan.io"
  };

  return explorers[chainId] || null;
}

/**
 * Main function
 */
async function main() {
  console.log("=================================================");
  console.log("Comprehensive Chain Scanner for Contract");
  console.log("=================================================");
  console.log(`Target address: ${TARGET_ADDRESS}`);
  console.log("Scanning across multiple EVM chains...");
  console.log("=================================================\n");

  const results: { chainName: string; chainId: number; exists: boolean }[] = [];

  // Run checks sequentially to avoid rate limiting
  for (const chain of CHAINS) {
    const exists = await checkContractOnChain(chain);
    results.push({ chainName: chain.name, chainId: chain.id, exists });
    console.log(); // Add space between results
  }

  // Summarize results
  console.log("=================================================");
  console.log("SUMMARY OF RESULTS");
  console.log("=================================================");

  const foundChains = results.filter(r => r.exists);

  if (foundChains.length > 0) {
    console.log(`✅ Contract found on the following chains:`);
    for (const chain of foundChains) {
      const explorer = getExplorerUrl(chain.chainId);
      console.log(`- ${chain.chainName} (Chain ID: ${chain.chainId})`);
      if (explorer) {
        console.log(`  View on block explorer: ${explorer}/address/${TARGET_ADDRESS}`);
      }
    }
  } else {
    console.log(`❌ Contract not found on any of the ${CHAINS.length} chains checked.`);
    console.log("\nPossible explanations:");
    console.log("1. Contract may be deployed on a chain not included in our scan list");
    console.log("2. The address might be incorrect");
    console.log("3. The contract might have been self-destructed");
    console.log("4. The address might be intended for future deployments");
  }

  console.log("\n=================================================");
  console.log("NEXT STEPS");
  console.log("=================================================");

  if (foundChains.length > 0) {
    console.log("1. Verify if the bytecode matches on all chains where deployed");
    console.log("2. Use scripts/deploy-deterministic-crosschain.ts to deploy to other chains");
    console.log("3. Follow the manual verification guide for each chain");
  } else {
    console.log("1. Double-check the target address for accuracy");
    console.log("2. If the address is intended for deployment, proceed with scripts/deploy-deterministic-crosschain.ts");
    console.log("3. Use CREATE2 to deploy to the exact same address on all chains");
  }
}

// Run the script
main().catch(console.error);
