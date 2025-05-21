/**
 * Check Contract Information on Gnosisscan
 *
 * This script uses the Gnosisscan API to check if a contract exists at a specific address
 * and retrieves information about it directly from the blockchain explorer.
 */

import axios from "axios";

// Target contract address
const TARGET_ADDRESS = "0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e";

// Gnosisscan API key and base URL
const GNOSISSCAN_API_KEY = "89SNHUCI1TAXG7HWUNW9Z1ZYXT93G22HHQ";
const GNOSISSCAN_API_URL = "https://api.gnosisscan.io/api";

/**
 * Get contract ABI from Gnosisscan
 */
async function getContractABI() {
  const params = new URLSearchParams();
  params.append("module", "contract");
  params.append("action", "getabi");
  params.append("address", TARGET_ADDRESS);
  params.append("apikey", GNOSISSCAN_API_KEY);

  try {
    console.log(`Querying Gnosisscan for contract ABI at ${TARGET_ADDRESS}...`);
    const response = await axios.get(`${GNOSISSCAN_API_URL}?${params.toString()}`);
    console.log("API Response:", response.data);

    if (response.data.status === "1") {
      return {
        success: true,
        abi: JSON.parse(response.data.result)
      };
    } else {
      return {
        success: false,
        error: response.data.result
      };
    }
  } catch (error) {
    console.error(`API error: ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Get contract source code from Gnosisscan
 */
async function getContractSourceCode() {
  const params = new URLSearchParams();
  params.append("module", "contract");
  params.append("action", "getsourcecode");
  params.append("address", TARGET_ADDRESS);
  params.append("apikey", GNOSISSCAN_API_KEY);

  try {
    console.log(`Querying Gnosisscan for contract source code at ${TARGET_ADDRESS}...`);
    const response = await axios.get(`${GNOSISSCAN_API_URL}?${params.toString()}`);
    console.log("API Response:", response.data);

    if (response.data.status === "1" && response.data.result && response.data.result.length > 0) {
      return {
        success: true,
        sourceCode: response.data.result[0]
      };
    } else {
      return {
        success: false,
        error: response.data.result || "No source code found"
      };
    }
  } catch (error) {
    console.error(`API error: ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Check if contract exists by getting its balance
 */
async function checkContractExists() {
  const params = new URLSearchParams();
  params.append("module", "account");
  params.append("action", "balance");
  params.append("address", TARGET_ADDRESS);
  params.append("tag", "latest");
  params.append("apikey", GNOSISSCAN_API_KEY);

  try {
    console.log(`Checking if contract exists at ${TARGET_ADDRESS}...`);
    const response = await axios.get(`${GNOSISSCAN_API_URL}?${params.toString()}`);
    console.log("API Response:", response.data);

    return {
      success: response.data.status === "1",
      exists: response.data.status === "1",
      balance: response.data.result,
      error: response.data.status !== "1" ? response.data.result : null
    };
  } catch (error) {
    console.error(`API error: ${(error as Error).message}`);
    return {
      success: false,
      exists: false,
      error: (error as Error).message
    };
  }
}

/**
 * Get transactions for the contract
 */
async function getContractTransactions() {
  const params = new URLSearchParams();
  params.append("module", "account");
  params.append("action", "txlist");
  params.append("address", TARGET_ADDRESS);
  params.append("startblock", "0");
  params.append("endblock", "99999999");
  params.append("page", "1");
  params.append("offset", "10");
  params.append("sort", "desc");
  params.append("apikey", GNOSISSCAN_API_KEY);

  try {
    console.log(`Fetching transactions for contract ${TARGET_ADDRESS}...`);
    const response = await axios.get(`${GNOSISSCAN_API_URL}?${params.toString()}`);
    console.log("API Response Status:", response.data.status, "Message:", response.data.message);

    if (response.data.status === "1" && response.data.result && response.data.result.length > 0) {
      // Just report how many transactions were found
      return {
        success: true,
        count: response.data.result.length,
        transactions: response.data.result.slice(0, 3) // Just the first 3 for brevity
      };
    } else {
      return {
        success: false,
        count: 0,
        error: response.data.message || "No transactions found"
      };
    }
  } catch (error) {
    console.error(`API error: ${(error as Error).message}`);
    return {
      success: false,
      count: 0,
      error: (error as Error).message
    };
  }
}

/**
 * Main function
 */
async function main() {
  console.log("Checking contract information on Gnosisscan");
  console.log("===========================================");
  console.log(`Target address: ${TARGET_ADDRESS}`);
  console.log();

  // Step 1: Check if contract exists
  const existsResult = await checkContractExists();
  if (!existsResult.success || !existsResult.exists) {
    console.error(`Contract does not exist at ${TARGET_ADDRESS} or API error occurred.`);
    console.error(`Error: ${existsResult.error || "Unknown error"}`);
    // Continue anyway to check other endpoints
    console.log("Continuing with other API checks...\n");
  } else {
    console.log(`Contract exists at ${TARGET_ADDRESS}`);
    console.log(`Balance: ${existsResult.balance} wei\n`);
  }

  // Step 2: Try to get transactions
  const txResult = await getContractTransactions();
  if (txResult.success && txResult.count > 0) {
    console.log(`Found ${txResult.count} transactions for contract`);
    console.log("Sample transactions:");
    console.log(JSON.stringify(txResult.transactions, null, 2));
    console.log();
  } else {
    console.log(`No transactions found or API error: ${txResult.error || "Unknown error"}\n`);
  }

  // Step 3: Try to get ABI
  const abiResult = await getContractABI();
  if (abiResult.success) {
    console.log("Contract ABI found:");
    console.log(JSON.stringify(abiResult.abi, null, 2));
    console.log();
  } else {
    console.log(`Could not retrieve ABI: ${abiResult.error}\n`);
  }

  // Step 4: Try to get source code
  const sourceResult = await getContractSourceCode();
  if (sourceResult.success) {
    console.log("Contract Source Code Information:");
    const sourceInfo = sourceResult.sourceCode;
    console.log(`Contract Name: ${sourceInfo.ContractName}`);
    console.log(`Compiler Version: ${sourceInfo.CompilerVersion}`);
    console.log(`Optimization: ${sourceInfo.OptimizationUsed === "1" ? "Yes" : "No"}`);
    console.log(`Verified: ${sourceInfo.ABI && sourceInfo.ABI !== "Contract source code not verified" ? "Yes" : "No"}`);

    // Check if source code is verified
    if (sourceInfo.SourceCode && sourceInfo.SourceCode !== "") {
      console.log("Contract is verified on Gnosisscan");
      if (sourceInfo.SourceCode.length > 200) {
        console.log(`Source code available (${sourceInfo.SourceCode.length} characters)`);
      } else {
        console.log("Source code:", sourceInfo.SourceCode);
      }
    } else {
      console.log("Contract source code is not verified on Gnosisscan");
    }
  } else {
    console.log(`Could not retrieve source code: ${sourceResult.error}`);
  }

  // Summary
  console.log("\nSummary:");
  console.log("========");
  console.log(`Contract at ${TARGET_ADDRESS} on Gnosis Chain:`);
  console.log(`- Exists: ${existsResult.exists ? "Yes" : "No"}`);
  console.log(`- Has transactions: ${txResult.success && txResult.count > 0 ? "Yes" : "No"}`);
  console.log(`- ABI available: ${abiResult.success ? "Yes" : "No"}`);
  console.log(`- Source verified: ${sourceResult.success && sourceResult.sourceCode && sourceResult.sourceCode.SourceCode && sourceResult.sourceCode.SourceCode !== "" ? "Yes" : "No"}`);

  if (sourceResult.success && sourceResult.sourceCode) {
    console.log(`- Compiler version: ${sourceResult.sourceCode.CompilerVersion || "Unknown"}`);
  }

  console.log("\nRecommendation:");
  if (!sourceResult.success || !sourceResult.sourceCode || !sourceResult.sourceCode.SourceCode || sourceResult.sourceCode.SourceCode === "") {
    console.log("Contract is not verified on Gnosisscan. You need to verify it with:");
    console.log("1. The correct compiler version");
    console.log("2. The exact source code");
    console.log("3. Constructor arguments if any");
    console.log("4. Optimization settings that match the deployment");
    console.log("Try verifying using this source code and compiler version 0.8.20");
  } else {
    console.log("Contract is already verified on Gnosisscan.");
  }
}

// Run the script
main().catch(console.error);
