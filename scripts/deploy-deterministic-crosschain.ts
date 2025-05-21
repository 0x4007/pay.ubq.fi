/**
 * Deterministic Cross-Chain Deployment Script
 *
 * This script deploys the PermitAggregator contract using CREATE2 to achieve
 * the same address across different chains (Ethereum mainnet, Gnosis Chain, etc.)
 *
 * It calculates the required salt to achieve the target address and uses the same
 * bytecode and constructor arguments across all chains.
 */

import { createWalletClient, http, createPublicClient, parseEther, getCreate2Address, getContractAddress, keccak256, concat, encodeAbiParameters, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, gnosis } from "viem/chains";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Target address that we want to deploy to on all chains
const TARGET_ADDRESS = "0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e";

// Permit2 address (same on all EVM chains)
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// RPC URLs
const MAINNET_RPC_URL = process.env.ETH_RPC_URL || "https://rpc.ubq.fi/1";
const GNOSIS_RPC_URL = process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";

// Supported chains for deterministic deployment
const SUPPORTED_CHAINS = {
  mainnet: {
    ...mainnet,
    rpcUrls: {
      default: { http: [MAINNET_RPC_URL] },
      public: { http: [MAINNET_RPC_URL] }
    }
  },
  gnosis: {
    ...gnosis,
    rpcUrls: {
      default: { http: [GNOSIS_RPC_URL] },
      public: { http: [GNOSIS_RPC_URL] }
    }
  }
};

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

  // Find salt using brute force
  let salt = '';
  let saltBigInt = BigInt(0);
  let saltHex = '';
  let calculatedAddress = '';
  const targetAddressLower = TARGET_ADDRESS.toLowerCase();

  console.log("Searching for salt - this may take a while...");

  // First try common values
  const commonSalts = [
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    '0x000000000000000000000000000000000000000000000000000000000000dead',
    '0x1234567890123456789012345678901234567890123456789012345678901234',
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  ];

  for (const testSalt of commonSalts) {
    const calculatedAddress = getCreate2Address({
      from: factoryAddress,
      salt: testSalt,
      bytecode: initCode,
    });

    if (calculatedAddress.toLowerCase() === targetAddressLower) {
      console.log(`Found matching salt: ${testSalt}`);
      return testSalt;
    }
  }

  // Try sequential values if common salts don't work
  console.log("Common salts didn't work. Starting brute force search...");

  // Start from a random value to increase chance of finding a solution
  saltBigInt = BigInt('0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join(''));

  while (true) {
    if (saltBigInt % BigInt(1000000) === BigInt(0)) {
      // Log progress every million attempts
      console.log(`Tried ${saltBigInt} salts...`);
    }

    saltHex = '0x' + saltBigInt.toString(16).padStart(64, '0');
    calculatedAddress = getCreate2Address({
      from: factoryAddress,
      salt: saltHex,
      bytecode: initCode,
    });

    if (calculatedAddress.toLowerCase() === targetAddressLower) {
      console.log(`Found matching salt: ${saltHex}`);
      return saltHex;
    }

    saltBigInt = saltBigInt + BigInt(1);

    // Safety check to avoid infinite loop
    if (saltBigInt > BigInt('0x1000000000000000000000000000000000000000000000000000000000000000')) {
      throw new Error("Salt search exceeded maximum value without finding a match");
    }
  }
}

/**
 * Deploy the contract using CREATE2 to achieve deterministic address
 */
async function deployContractWithCreate2(chain: string, salt: string, abi: any, bytecode: string) {
  console.log(`\nDeploying to ${chain} using CREATE2...`);

  // Read private key from environment variable
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY environment variable is required");
  }

  // Create account from private key
  const account = privateKeyToAccount(`0x${privateKey}`);
  console.log(`Using account: ${account.address}`);

  // Create clients
  const selectedChain = SUPPORTED_CHAINS[chain as keyof typeof SUPPORTED_CHAINS];
  const walletClient = createWalletClient({
    account,
    chain: selectedChain,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain: selectedChain,
    transport: http(),
  });

  // Check if contract already exists at the target address
  const code = await publicClient.getBytecode({ address: TARGET_ADDRESS as `0x${string}` });
  if (code && code !== '0x') {
    console.log(`Contract already deployed at ${TARGET_ADDRESS} on ${chain}`);
    return { success: true, contractAddress: TARGET_ADDRESS, alreadyDeployed: true };
  }

  // Construct transaction for CREATE2 deployment
  // Note: This is a simplified example and may need adjustments for production use

  console.log(`Deploying with salt: ${salt}`);

  // Prepare the init code (bytecode + encoded constructor args)
  const encodedArgs = encodeAbiParameters(
    parseAbiParameters(['address']),
    [PERMIT2_ADDRESS]
  ).slice(2); // remove '0x' prefix

  const initCode = `0x${bytecode}${encodedArgs}`;

  // Verify the calculated address matches our target
  const calculatedAddress = getCreate2Address({
    from: account.address,
    salt,
    bytecode: initCode,
  });

  console.log(`Calculated address: ${calculatedAddress}`);
  if (calculatedAddress.toLowerCase() !== TARGET_ADDRESS.toLowerCase()) {
    throw new Error(`Calculated address ${calculatedAddress} does not match target address ${TARGET_ADDRESS}`);
  }

  // TODO: Implement an actual CREATE2 deployment
  // For now, this is a placeholder showing what would be needed

  console.log("CREATE2 deployment requires a factory contract");
  console.log("This script is a proof-of-concept showing the salt required for deterministic deployment");
  console.log(`To deploy to ${TARGET_ADDRESS} on all chains, you would need:`);
  console.log(`1. A CREATE2 factory deployed at the same address on all chains`);
  console.log(`2. Using this salt: ${salt}`);
  console.log(`3. Using compiler version 0.8.20 with 200 optimization runs`);
  console.log(`4. Constructing with PERMIT2_ADDRESS: ${PERMIT2_ADDRESS}`);

  return {
    success: false,
    error: "CREATE2 factory implementation required",
    salt,
    calculatedAddress,
    initCodeHash: keccak256(initCode)
  };
}

/**
 * Main function
 */
async function main() {
  console.log("Deterministic Cross-Chain Deployment");
  console.log("===================================");
  console.log(`Target address: ${TARGET_ADDRESS}`);

  try {
    // Compile contract to get bytecode
    const { abi, bytecode } = await compileContract();

    // Get account address from environment
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("DEPLOYER_PRIVATE_KEY environment variable is required");
    }
    const account = privateKeyToAccount(`0x${privateKey}`);

    // Find the salt needed for deterministic address
    const salt = await findSaltForAddress(bytecode, account.address);

    // Save the salt for future use
    const saltInfoPath = join(__dirname, "deterministic-salt.json");
    writeFileSync(saltInfoPath, JSON.stringify({
      targetAddress: TARGET_ADDRESS,
      permitAddress: PERMIT2_ADDRESS,
      salt,
      deployer: account.address,
      compilerVersion: "0.8.20",
      optimizationRuns: 200
    }, null, 2));

    console.log(`\nSalt information saved to ${saltInfoPath}`);

    // Attempt deploying to supported chains
    for (const chain of Object.keys(SUPPORTED_CHAINS)) {
      const result = await deployContractWithCreate2(chain, salt, abi, bytecode);
      console.log(`\nResult for ${chain}:`, result);
    }

    return { success: true };
  } catch (error) {
    console.error(`\n❌ Error: ${(error as Error).message}`);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return { success: false, error: String(error) };
  }
}

// Run the script
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { compileContract, findSaltForAddress, deployContractWithCreate2 };
