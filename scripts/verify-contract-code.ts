/**
 * Verify Contract Source Code using Etherscan-compatible APIs
 *
 * This script verifies contract source code on Etherscan, GnosisScan, and other
 * compatible block explorers by submitting source code through their API.
 *
 * For Gnosis Chain, it uses the GnosisScan API (part of Etherscan API family).
 */

import axios from "axios";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "child_process";
import { config } from "dotenv";

// Load environment variables
config();

// Target address
const CONTRACT_ADDRESS = process.env.TARGET_ADDRESS || "0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e";

// Chain-specific settings
const CHAIN_SETTINGS = {
  gnosis: {
    name: "Gnosis Chain",
    apiUrl: "https://api.gnosisscan.io/api",
    apiKey: process.env.GNOSISSCAN_API_KEY || "",
    browserUrl: "https://gnosisscan.io"
  },
  ethereum: {
    name: "Ethereum Mainnet",
    apiUrl: "https://api.etherscan.io/api",
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    browserUrl: "https://etherscan.io"
  },
  optimism: {
    name: "Optimism",
    apiUrl: "https://api-optimistic.etherscan.io/api",
    apiKey: process.env.OPTIMISTIC_ETHERSCAN_API_KEY || "",
    browserUrl: "https://optimistic.etherscan.io"
  },
  arbitrum: {
    name: "Arbitrum One",
    apiUrl: "https://api.arbiscan.io/api",
    apiKey: process.env.ARBISCAN_API_KEY || "",
    browserUrl: "https://arbiscan.io"
  },
  polygon: {
    name: "Polygon",
    apiUrl: "https://api.polygonscan.com/api",
    apiKey: process.env.POLYGONSCAN_API_KEY || "",
    browserUrl: "https://polygonscan.com"
  }
};

// Default to Gnosis Chain
const CHAIN = process.env.VERIFY_CHAIN || "gnosis";
const chainConfig = CHAIN_SETTINGS[CHAIN as keyof typeof CHAIN_SETTINGS];

if (!chainConfig) {
  console.error(`Error: Unsupported chain "${CHAIN}". Supported chains are: ${Object.keys(CHAIN_SETTINGS).join(", ")}`);
  process.exit(1);
}

// Contract settings
const CONTRACT_NAME = "PermitAggregator";
const CONTRACT_PATH = path.join(__dirname, "..", "contracts", "PermitAggregator.sol");
const COMPILER_VERSION = "v0.8.20+commit.a1b79de6"; // Specify exact compiler version
const OPTIMIZATION_USED = true;
const OPTIMIZATION_RUNS = 200;
const LICENSE_TYPE = 3; // MIT License (3)

// Constructor arguments (ABI-encoded) - Permit2 Address
const CONSTRUCTOR_ARGS = process.env.CONSTRUCTOR_ARGS || `0x000000000022D473030F116dDEE9F6B43aC78BA3`;
const ABI_ENCODED_ARGS = process.env.ABI_ENCODED_ARGS || ""; // If empty, will be generated

/**
 * Check if the contract exists at the specified address
 */
async function checkContractExists() {
  try {
    console.log(`Checking if contract exists at ${CONTRACT_ADDRESS} on ${chainConfig.name}...`);
    const response = await axios.post(
      chainConfig.browserUrl === "https://gnosisscan.io"
        ? "https://rpc.gnosischain.com"
        : `https://rpc.ubq.fi/${CHAIN === "ethereum" ? "1" : CHAIN === "optimism" ? "10" : CHAIN === "arbitrum" ? "42161" : CHAIN === "polygon" ? "137" : "100"}`,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [CONTRACT_ADDRESS, "latest"]
      }
    );

    const bytecode = response.data.result;

    if (!bytecode || bytecode === "0x") {
      console.error(`❌ No contract found at ${CONTRACT_ADDRESS} on ${chainConfig.name}`);
      console.log("Please deploy the contract first before verification");
      return false;
    }

    console.log(`✅ Contract found at ${CONTRACT_ADDRESS} with bytecode of length: ${bytecode.length} characters`);
    return true;
  } catch (error) {
    console.error(`Error checking contract: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Encode constructor arguments
 */
async function encodeConstructorArgs() {
  if (ABI_ENCODED_ARGS) return ABI_ENCODED_ARGS;

  try {
    console.log(`Encoding constructor arguments: ${CONSTRUCTOR_ARGS}`);
    // Using viem to encode constructor arguments
    const result = execSync(`npx viem abi-encode "address" ${CONSTRUCTOR_ARGS}`).toString().trim();
    console.log(`Encoded constructor arguments: ${result}`);
    return result.startsWith("0x") ? result.slice(2) : result; // Remove 0x prefix if present
  } catch (error) {
    console.error(`Error encoding constructor arguments: ${(error as Error).message}`);
    console.log("You can manually specify the ABI-encoded arguments in the .env file as ABI_ENCODED_ARGS");
    throw error;
  }
}

/**
 * Submit verification request
 */
async function submitVerificationRequest() {
  if (!chainConfig.apiKey) {
    console.error(`❌ Error: No API key provided for ${chainConfig.name}`);
    console.log(`Please set ${CHAIN.toUpperCase()}_API_KEY in your .env file`);
    return false;
  }

  try {
    const sourceCode = fs.readFileSync(CONTRACT_PATH, "utf8");
    const encodedArgs = await encodeConstructorArgs();

    console.log(`Submitting verification request to ${chainConfig.name}...`);
    const response = await axios.post(
      chainConfig.apiUrl,
      null,
      {
        params: {
          apikey: chainConfig.apiKey,
          module: "contract",
          action: "verifysourcecode",
          contractaddress: CONTRACT_ADDRESS,
          sourceCode: sourceCode,
          codeformat: "solidity-single-file",
          contractname: CONTRACT_NAME,
          compilerversion: COMPILER_VERSION,
          optimizationUsed: OPTIMIZATION_USED ? 1 : 0,
          runs: OPTIMIZATION_RUNS,
          constructorArguements: encodedArgs,
          licenseType: LICENSE_TYPE
        }
      }
    );

    if (response.data.status === "1") {
      console.log(`✅ Verification request submitted successfully!`);
      console.log(`GUID: ${response.data.result}`);
      console.log(`Check verification status with:`);
      console.log(`curl "${chainConfig.apiUrl}?apikey=${chainConfig.apiKey}&module=contract&action=checkverifystatus&guid=${response.data.result}"`);

      // Wait a few seconds and check status
      await new Promise(resolve => setTimeout(resolve, 10000));
      await checkVerificationStatus(response.data.result);

      return true;
    } else {
      console.error(`❌ Verification request failed:`);
      console.error(response.data.result);
      return false;
    }
  } catch (error) {
    console.error(`Error during verification: ${(error as Error).message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

/**
 * Check verification status
 */
async function checkVerificationStatus(guid: string) {
  try {
    console.log(`Checking verification status for GUID: ${guid}...`);
    const response = await axios.get(
      `${chainConfig.apiUrl}`,
      {
        params: {
          apikey: chainConfig.apiKey,
          module: "contract",
          action: "checkverifystatus",
          guid: guid
        }
      }
    );

    console.log(`Status: ${response.data.result}`);

    if (response.data.result === "Pending in queue") {
      console.log("Verification is still pending. Check status later with the GUID.");
    } else if (response.data.result.includes("Successfully")) {
      console.log(`✅ Contract successfully verified!`);
      console.log(`View on ${chainConfig.browserUrl}/address/${CONTRACT_ADDRESS}#code`);
    } else {
      console.error(`❌ Verification failed: ${response.data.result}`);
      console.log("Please check the error message and try again.");
    }

    return response.data.result;
  } catch (error) {
    console.error(`Error checking verification status: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log("=================================================");
  console.log(`Contract Source Code Verification`);
  console.log("=================================================");
  console.log(`Target Chain: ${chainConfig.name}`);
  console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
  console.log(`Contract Name: ${CONTRACT_NAME}`);
  console.log(`Compiler: ${COMPILER_VERSION}`);
  console.log(`Optimization: ${OPTIMIZATION_USED ? "Yes" : "No"}${OPTIMIZATION_USED ? ` (${OPTIMIZATION_RUNS} runs)` : ""}`);
  console.log("=================================================\n");

  // Check if contract exists before proceeding
  const contractExists = await checkContractExists();
  if (!contractExists) {
    console.log("\n=================================================");
    console.log("VERIFICATION SKIPPED - CONTRACT NOT DEPLOYED");
    console.log("=================================================");
    console.log("To verify contract source code:");
    console.log("1. First deploy the contract to the target address");
    console.log("2. Set the appropriate API key in your .env file");
    console.log("3. Run this script again");
    return false;
  }

  // Submit verification request
  const result = await submitVerificationRequest();

  if (result) {
    console.log("\n=================================================");
    console.log("VERIFICATION COMPLETE");
    console.log("=================================================");
    console.log(`Contract at ${CONTRACT_ADDRESS} is now verified on ${chainConfig.name}`);
    console.log(`View at: ${chainConfig.browserUrl}/address/${CONTRACT_ADDRESS}#code`);
  } else {
    console.log("\n=================================================");
    console.log("VERIFICATION FAILED");
    console.log("=================================================");
    console.log("Troubleshooting tips:");
    console.log("1. Check that your API key is correct");
    console.log("2. Ensure compiler version matches exactly (including commit hash)");
    console.log("3. Verify optimization settings match the deployed contract");
    console.log("4. Check that constructor arguments are correctly encoded");
    console.log("5. Try using the block explorer's UI for verification if API fails");
  }

  return result;
}

// Run the script
main().catch(console.error);
