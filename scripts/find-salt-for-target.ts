/**
 * Find Salt for Target Address
 *
 * A simplified version of deploy-deterministic-crosschain.ts that ONLY calculates
 * the salt needed for deploying to a target address. Does not require a private key
 * and does not attempt actual deployment.
 *
 * This is useful for planning cross-chain deployments without needing funds or keys.
 */

import { getCreate2Address, encodeAbiParameters, parseAbiParameters, keccak256 } from "viem";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Target address that we want to deploy to on all chains
const TARGET_ADDRESS = "0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e";

// Permit2 address (same on all EVM chains)
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Singleton Factory address (same on all EVM chains)
const SINGLETON_FACTORY_ADDRESS = "0xce0042B868300000d44A59004Da54A005ffdcf9f";

/**
 * Compile the PermitAggregator contract
 */
async function compileContract() {
  console.log("Compiling PermitAggregator contract...");

  const contractPath = join(__dirname, "..", "contracts", "PermitAggregator.sol");
  const sourceCode = readFileSync(contractPath, "utf8");

  // Create temp directory for compilation
  const tempDir = join(__dirname, "temp-deterministic");
  const tempContractPath = join(tempDir, "PermitAggregator.sol");
  const tempOutputPath = join(tempDir, "output.json");

  try {
    // Ensure temp directory exists
    await execAsync(`mkdir -p ${tempDir}`);

    // Write contract to temp file
    writeFileSync(tempContractPath, sourceCode);

    // Compile using solc version 0.8.20
    const solcCommand = `npx solc@0.8.20 --optimize --optimize-runs 200 --standard-json > ${tempOutputPath} << EOL
    {
      "language": "Solidity",
      "sources": {
        "PermitAggregator.sol": {
          "content": ${JSON.stringify(sourceCode)}
        }
      },
      "settings": {
        "optimizer": {
          "enabled": true,
          "runs": 200
        },
        "outputSelection": {
          "*": {
            "*": ["abi", "evm.bytecode", "evm.deployedBytecode"]
          }
        }
      }
    }
EOL`;

    console.log("Running solc compiler...");
    await execAsync(solcCommand);

    // Read compiled output
    const compiledOutput = JSON.parse(readFileSync(tempOutputPath, "utf8"));

    if (compiledOutput.errors) {
      const hasError = compiledOutput.errors.some((err: any) => err.severity === "error");
      if (hasError) {
        throw new Error("Compilation failed: " + JSON.stringify(compiledOutput.errors));
      } else {
        console.warn("Compilation warnings:", compiledOutput.errors);
      }
    }

    const contractOutput = compiledOutput.contracts["PermitAggregator.sol"].PermitAggregator;
    const abi = contractOutput.abi;
    const bytecode = contractOutput.evm.bytecode.object;

    console.log("Contract compiled successfully");
    return { abi, bytecode };
  } catch (error) {
    console.error("Compilation error:", error);
    throw error;
  } finally {
    // Clean up temp files
    await execAsync(`rm -rf ${tempDir}`);
  }
}

/**
 * Find the salt needed to deploy a contract at the target address
 */
async function findSaltForAddress(bytecode: string, factoryAddress: string) {
  console.log(`Finding salt for deploying to address ${TARGET_ADDRESS}...`);
  console.log(`Using factory address: ${factoryAddress}`);

  // Prepare the init code (bytecode + encoded constructor args)
  const encodedArgs = encodeAbiParameters(
    parseAbiParameters(['address']),
    [PERMIT2_ADDRESS]
  ).slice(2); // remove '0x' prefix

  const initCode = `0x${bytecode}${encodedArgs}`;
  console.log(`Init code hash: ${keccak256(initCode)}`);

  // Find salt using brute force - this is simplified for demonstration
  // In real use, this could take a long time
  let saltBigInt = BigInt(0);
  let saltHex = '';
  let calculatedAddress = '';
  const targetAddressLower = TARGET_ADDRESS.toLowerCase();

  console.log("Searching for salt - this may take a while...");

  // First try common values
  const commonSalts = [
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000000000000000000000000000dead',
    '0x0000000000000000000000000000000000000000000000000000000000000001',
    '0x0000000000000000000000000000000000000000000000000000000000000042',
    '0x1234567890123456789012345678901234567890123456789012345678901234',
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  ];

  for (const testSalt of commonSalts) {
    const addr = getCreate2Address({
      from: factoryAddress,
      salt: testSalt,
      bytecode: initCode,
    });

    console.log(`- Testing salt ${testSalt} => ${addr}`);

    if (addr.toLowerCase() === targetAddressLower) {
      console.log(`Found matching salt: ${testSalt}`);
      return testSalt;
    }
  }

  // Try a fixed number of iterations for demonstration
  console.log("Common salts didn't work. Trying first 1000 sequential values...");

  const maxIterations = 1000; // Limit for demonstration
  for (let i = 0; i < maxIterations; i++) {
    saltBigInt = BigInt(i);
    saltHex = '0x' + saltBigInt.toString(16).padStart(64, '0');
    calculatedAddress = getCreate2Address({
      from: factoryAddress,
      salt: saltHex,
      bytecode: initCode,
    });

    if (i % 100 === 0) {
      console.log(`- Tried ${i} salts... Last: ${saltHex.substring(0, 10)}...`);
    }

    if (calculatedAddress.toLowerCase() === targetAddressLower) {
      console.log(`Found matching salt: ${saltHex}`);
      return saltHex;
    }
  }

  console.log(`\nSALT NOT FOUND in first ${maxIterations} values.`);
  console.log("In a real deployment, you would need to run a more extensive search.");
  console.log("This could take hours or days depending on the target address complexity.");

  // Demonstration of a random salt result
  const randomSalt = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const randomAddress = getCreate2Address({
    from: factoryAddress,
    salt: randomSalt,
    bytecode: initCode,
  });

  console.log("\nDEMONSTRATION ONLY:");
  console.log(`Random salt ${randomSalt} would deploy to ${randomAddress}`);

  return null;
}

/**
 * Main function
 */
async function main() {
  console.log("=================================================");
  console.log("Find Salt for Target Address");
  console.log("=================================================");
  console.log(`Target address: ${TARGET_ADDRESS}`);
  console.log(`Permit2 address: ${PERMIT2_ADDRESS}`);
  console.log(`Singleton Factory address: ${SINGLETON_FACTORY_ADDRESS}`);
  console.log("=================================================\n");

  try {
    // Check if PermitAggregator.sol exists
    console.log("Checking for PermitAggregator.sol...");
    const contractPath = join(__dirname, "..", "contracts", "PermitAggregator.sol");
    try {
      readFileSync(contractPath, "utf8");
      console.log("✅ Contract found");
    } catch (e) {
      console.error("❌ Contract not found at", contractPath);
      return { success: false, error: "Contract not found" };
    }

    // Compile contract to get bytecode
    const { abi, bytecode } = await compileContract();
    console.log(`Contract bytecode length: ${bytecode.length} characters`);

    // Find the salt needed for deterministic address using Singleton Factory
    const salt = await findSaltForAddress(bytecode, SINGLETON_FACTORY_ADDRESS);

    if (salt) {
      // Save the salt for future use
      const saltInfoPath = join(__dirname, "deterministic-deployment-info.json");
      writeFileSync(saltInfoPath, JSON.stringify({
        targetAddress: TARGET_ADDRESS,
        permitAddress: PERMIT2_ADDRESS,
        factoryAddress: SINGLETON_FACTORY_ADDRESS,
        salt,
        compilerVersion: "0.8.20",
        optimizationRuns: 200,
        calculatedAt: new Date().toISOString()
      }, null, 2));

      console.log(`\nSalt information saved to ${saltInfoPath}`);

      console.log("\n=================================================");
      console.log("DEPLOYMENT INSTRUCTIONS");
      console.log("=================================================");
      console.log("To deploy this contract to the same address on all chains:");
      console.log(`1. Use the Singleton Factory at ${SINGLETON_FACTORY_ADDRESS}`);
      console.log(`2. Use salt: ${salt}`);
      console.log(`3. Compile with Solidity 0.8.20 with 200 optimization runs`);
      console.log(`4. Constructor argument: ${PERMIT2_ADDRESS}`);
      console.log("\nThis will deploy to address:", TARGET_ADDRESS);
      console.log("on any EVM chain where the Singleton Factory is available.");
    } else {
      console.log("\n⚠️ Could not find a matching salt in the limited demonstration");
      console.log("For actual deployment, a more extensive search would be needed.");
    }

    return { success: !!salt, salt };
  } catch (error) {
    console.error(`\n❌ Error: ${(error as Error).message}`);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return { success: false, error: String(error) };
  }
}

// Run the script
main().catch(console.error);
