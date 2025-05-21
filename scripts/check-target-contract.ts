/**
 * Check Deployed PermitAggregator Contract Source Compatibility
 *
 * This script:
 * 1. Checks the deployed bytecode at the target address
 * 2. Retrieves metadata from the deployed bytecode
 * 3. Attempts to determine the compiler version used for the deployed contract
 */

import axios from "axios";

// Target contract address
const TARGET_ADDRESS = "0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e";

// RPC URLs using the ubq.fi format
const getRpcUrl = (chainId: number) => `https://rpc.ubq.fi/${chainId}`;
const GNOSIS_CHAIN_ID = 100;
const MAINNET_CHAIN_ID = 1;
const OPTIMISM_CHAIN_ID = 10;
const ARBITRUM_CHAIN_ID = 42161;
const POLYGON_CHAIN_ID = 137;

const RPC_URL = getRpcUrl(GNOSIS_CHAIN_ID); // Default to Gnosis Chain

// Define a function to check on multiple chains
async function checkOnMultipleChains() {
  const chainIds = [
    MAINNET_CHAIN_ID,      // Ethereum Mainnet
    GNOSIS_CHAIN_ID,       // Gnosis Chain
    OPTIMISM_CHAIN_ID,     // Optimism
    ARBITRUM_CHAIN_ID,     // Arbitrum
    POLYGON_CHAIN_ID       // Polygon
  ];

  console.log("Checking contract on multiple chains...\n");

  for (const chainId of chainIds) {
    const chainRpcUrl = getRpcUrl(chainId);
    let chainName = "";

    switch (chainId) {
      case 1: chainName = "Ethereum Mainnet"; break;
      case 10: chainName = "Optimism"; break;
      case 42161: chainName = "Arbitrum"; break;
      case 100: chainName = "Gnosis Chain"; break;
      case 137: chainName = "Polygon"; break;
      default: chainName = `Chain ID ${chainId}`;
    }

    console.log(`\n==== Checking on ${chainName} ====`);

    try {
      const response = await axios.post(chainRpcUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [TARGET_ADDRESS, "latest"]
      });

      if (response.data.error) {
        console.log(`Error: ${response.data.error.message}`);
        continue;
      }

      const bytecode = response.data.result;

      if (!bytecode || bytecode === "0x") {
        console.log(`No bytecode found at ${TARGET_ADDRESS} on ${chainName}`);
      } else {
        console.log(`Contract exists at ${TARGET_ADDRESS} on ${chainName}`);
        console.log(`Bytecode length: ${bytecode.length} characters`);
      }
    } catch (error) {
      console.log(`Network error for ${chainName}: ${(error as Error).message}`);
    }
  }
}

/**
 * Get deployed bytecode for a contract
 */
async function getDeployedBytecode() {
  try {
    const response = await axios.post(RPC_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getCode",
      params: [TARGET_ADDRESS, "latest"]
    });

    if (response.data.error) {
      throw new Error(`RPC Error: ${response.data.error.message}`);
    }

    return response.data.result;
  } catch (error) {
    console.error(`Failed to get bytecode: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Extract metadata from bytecode
 */
function extractMetadata(bytecode: string) {
  // Look for the CBOR encoded metadata at the end of the bytecode
  // This is a simplification - a more robust implementation would properly decode the CBOR
  console.log("Bytecode length:", bytecode.length);

  // The last part of the bytecode may contain compiler and version info
  const lastPart = bytecode.slice(-200);
  console.log("Last part of bytecode:", lastPart);

  // Try to identify solidity version markers in the bytecode
  const versionMarkers = [
    { version: "0.8.14", marker: "0.8.14+" },
    { version: "0.8.15", marker: "0.8.15+" },
    { version: "0.8.16", marker: "0.8.16+" },
    { version: "0.8.17", marker: "0.8.17+" },
    { version: "0.8.18", marker: "0.8.18+" },
    { version: "0.8.19", marker: "0.8.19+" },
    { version: "0.8.20", marker: "0.8.20+" }
  ];

  // Convert hex to ASCII to search for version strings
  const hexToAscii = (hex: string) => {
    let ascii = "";
    for (let i = 2; i < hex.length; i += 2) {
      const hexChar = hex.substr(i, 2);
      const decimal = parseInt(hexChar, 16);
      if (decimal >= 32 && decimal <= 126) { // printable ASCII range
        ascii += String.fromCharCode(decimal);
      }
    }
    return ascii;
  };

  const asciiRepresentation = hexToAscii(bytecode);
  console.log("ASCII representation excerpts (looking for version markers):");

  // Split into chunks to make it more readable
  const chunkSize = 100;
  for (let i = 0; i < asciiRepresentation.length; i += chunkSize) {
    console.log(asciiRepresentation.substring(i, i + chunkSize));
  }

  // Check for version markers
  for (const marker of versionMarkers) {
    if (asciiRepresentation.includes(marker.marker)) {
      console.log(`Found version marker for Solidity ${marker.version}`);
      return marker.version;
    }
  }

  return "Unknown version";
}

/**
 * Main function
 */
async function main() {
  console.log("=================================================");
  console.log("Multi-Chain Contract Deployment Verification");
  console.log("=================================================");
  console.log(`Checking for contract at address: ${TARGET_ADDRESS}`);
  console.log("Using Ubiquity RPC URLs (rpc.ubq.fi/<chainId>)");
  console.log("=================================================\n");

  // Step 1: Check if the contract exists on multiple chains
  await checkOnMultipleChains();

  // Step 2: Analyze the contract on Gnosis Chain if it exists
  try {
    console.log("\n\n=================================================");
    console.log("Detailed Analysis on Gnosis Chain");
    console.log("=================================================");
    console.log("Retrieving deployed bytecode from Gnosis Chain...");
    const bytecode = await getDeployedBytecode();

    if (!bytecode || bytecode === "0x") {
      console.error("No bytecode found at address on Gnosis Chain.");
      return;
    }

    console.log(`Retrieved bytecode of length ${bytecode.length}`);

    console.log("\nAnalyzing bytecode for metadata...");
    const version = extractMetadata(bytecode);

    console.log("\nResults:");
    console.log("--------");
    console.log(`Target address: ${TARGET_ADDRESS}`);
    console.log(`Identified compiler version: ${version}`);

    if (version !== "Unknown version") {
      console.log("\nRecommendation:");
      console.log(`When verifying, use Solidity compiler version ${version}`);
    } else {
      console.log("\nCould not identify the exact compiler version from bytecode.");
      console.log("Try verifying with Solidity 0.8.x where x is between 14 and 20.");
    }

  } catch (error) {
    console.error("Error during Gnosis Chain analysis:", (error as Error).message);
  }

  console.log("\n=================================================");
  console.log("Cross-Chain Deployment Summary");
  console.log("=================================================");
  console.log("To deploy this contract at the same address on all chains:");
  console.log("1. Use CREATE2 with deterministic salt");
  console.log("2. Use identical compiler version and settings");
  console.log("3. Use identical constructor arguments");
  console.log("See scripts/cross-chain-address-report.md for details");
}

// Run the script
main().catch(console.error);
