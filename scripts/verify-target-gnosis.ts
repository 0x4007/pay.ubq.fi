/**
 * Verify Existing PermitAggregator Contract on Gnosis Chain
 *
 * This script handles verification of the contract at the target address on Gnosisscan
 * with multiple compiler versions and optimization settings to increase success chances.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import axios from "axios";
import { setTimeout } from "node:timers/promises";

// Target contract address to verify
const TARGET_ADDRESS = "0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e";

// Gnosisscan API key for verification
const GNOSISSCAN_API_KEY = "89SNHUCI1TAXG7HWUNW9Z1ZYXT93G22HHQ";
const GNOSISSCAN_API_URL = "https://api.gnosisscan.io/api";

// Permit2 address on all chains
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Compiler versions to try (in order of likelihood)
const COMPILER_VERSIONS = [
  "v0.8.20+commit.a1b79de6",
  "v0.8.17+commit.8df45f5f",
  "v0.8.19+commit.7dd6d404",
  "v0.8.18+commit.87f61d96",
  "v0.8.16+commit.07a7930e"
];

// Constructor arguments - the Permit2 address in hex without 0x prefix
const CONSTRUCTOR_ARGS = "000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3";

/**
 * Verify contract on Gnosisscan with specific compiler settings
 */
async function verifyContractWithSettings(compilerVersion: string, optimizationRuns: number) {
  console.log(`\nAttempting verification with compiler ${compilerVersion} and ${optimizationRuns} optimization runs...`);

  // Read contract source code
  const contractPath = join(__dirname, "..", "contracts", "PermitAggregator.sol");
  const sourceCode = readFileSync(contractPath, "utf8");

  // Prepare verification request
  const params = new URLSearchParams();
  params.append("apikey", GNOSISSCAN_API_KEY);
  params.append("module", "contract");
  params.append("action", "verifysourcecode");
  params.append("contractaddress", TARGET_ADDRESS);
  params.append("sourceCode", sourceCode);
  params.append("codeformat", "solidity-single-file");
  params.append("contractname", "PermitAggregator");
  params.append("compilerversion", compilerVersion);
  params.append("optimizationUsed", "1");
  params.append("runs", optimizationRuns.toString());
  params.append("constructorArguments", CONSTRUCTOR_ARGS);
  params.append("licenseType", "3"); // MIT License

  try {
    // Submit verification request
    console.log("Submitting verification request...");
    const response = await axios.post(`${GNOSISSCAN_API_URL}`, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("API Response:", response.data);

    if (response.data.status !== "1") {
      console.error(`Verification submission failed: ${response.data.result}`);
      return { success: false, error: response.data.result };
    }

    const guid = response.data.result;
    console.log(`Verification submitted with GUID: ${guid}`);

    // Check verification status
    return await checkVerification(guid);
  } catch (error) {
    console.error(`Verification error: ${(error as Error).message}`);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Check verification status
 */
async function checkVerification(guid: string) {
  console.log("Waiting for verification result...");

  // Check verification status
  for (let i = 0; i < 10; i++) {
    // Wait before checking status
    const delay = Math.min(5000 * Math.pow(1.5, i), 30000); // Max 30 seconds
    await setTimeout(delay);

    // Check verification status
    const statusParams = new URLSearchParams();
    statusParams.append("apikey", GNOSISSCAN_API_KEY);
    statusParams.append("module", "contract");
    statusParams.append("action", "checkverifystatus");
    statusParams.append("guid", guid);

    try {
      const statusResponse = await axios.get(`${GNOSISSCAN_API_URL}?${statusParams.toString()}`);
      console.log("Status check response:", statusResponse.data);

      if (statusResponse.data.status === "1") {
        console.log(`Verification successful: ${statusResponse.data.result}`);
        return { success: true, message: statusResponse.data.result };
      } else if (statusResponse.data.result === "Pending in queue") {
        console.log(`Verification still pending, waiting...`);

        // If we're at the last attempt, wait longer for a pending verification
        if (i === 9) {
          console.log("Last attempt, waiting longer for pending verification...");
          await setTimeout(30000);
          i--; // Retry the last attempt
        }
      } else {
        console.error(`Verification failed: ${statusResponse.data.result}`);
        return { success: false, error: statusResponse.data.result };
      }
    } catch (error) {
      console.error(`Error checking status: ${(error as Error).message}`);
      // Continue trying
    }
  }

  return { success: false, error: "Verification timed out" };
}

/**
 * Main function - attempts verification with various compiler settings
 */
async function main() {
  console.log("Verifying PermitAggregator on Gnosis Chain");
  console.log("=========================================");
  console.log(`Target address: ${TARGET_ADDRESS}`);

  // Check if contract is already verified
  const checkParams = new URLSearchParams();
  checkParams.append("apikey", GNOSISSCAN_API_KEY);
  checkParams.append("module", "contract");
  checkParams.append("action", "getsourcecode");
  checkParams.append("address", TARGET_ADDRESS);

  try {
    console.log("\nChecking if contract is already verified...");
    const checkResponse = await axios.get(`${GNOSISSCAN_API_URL}?${checkParams.toString()}`);

    if (checkResponse.data.status === "1" &&
        checkResponse.data.result &&
        checkResponse.data.result.length > 0 &&
        checkResponse.data.result[0].SourceCode &&
        checkResponse.data.result[0].SourceCode !== "") {
      console.log("✅ Contract is already verified on Gnosisscan!");
      console.log(`View on Gnosisscan: https://gnosisscan.io/address/${TARGET_ADDRESS}#code`);
      return { success: true, alreadyVerified: true };
    }

    console.log("Contract is not verified. Proceeding with verification attempts...");
  } catch (error) {
    console.error(`Error checking verification status: ${(error as Error).message}`);
    console.log("Proceeding with verification attempts...");
  }

  // Try different optimization runs
  const optimizationRuns = [200, 1000, 999999, 0];

  // Try each compiler version with each optimization setting
  for (const version of COMPILER_VERSIONS) {
    for (const runs of optimizationRuns) {
      const result = await verifyContractWithSettings(version, runs);

      if (result.success) {
        console.log("\n✅ Contract successfully verified!");
        console.log(`Successful with compiler version ${version} and ${runs} optimization runs`);
        console.log(`View on Gnosisscan: https://gnosisscan.io/address/${TARGET_ADDRESS}#code`);
        return { success: true, compilerVersion: version, optimizationRuns: runs };
      }

      console.log(`Verification failed with compiler version ${version} and ${runs} optimization runs. Trying next configuration...`);
    }
  }

  console.log("\n⚠️ All verification attempts failed");
  console.log("Possible reasons:");
  console.log("1. The contract source code in the repository doesn't match the deployed contract");
  console.log("2. The constructor arguments are different");
  console.log("3. The compiler version used for deployment is not in our test list");
  console.log("4. The optimization settings don't match the deployment settings");

  console.log("\nRecommendation:");
  console.log("Try manual verification through the Gnosisscan UI:");
  console.log(`https://gnosisscan.io/address/${TARGET_ADDRESS}#code`);

  return { success: false };
}

// Run the script
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
