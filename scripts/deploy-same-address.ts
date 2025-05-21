/**
 * Cross-Chain Deployment Using Fixed Salt
 *
 * This script deploys the PermitAggregator contract to the same address across
 * multiple EVM chains using a fixed salt value. The address won't be the initially
 * targeted one, but will be consistent across all chains.
 */

import { config } from "dotenv";
import { createWalletClient, http, getCreate2Address, encodeAbiParameters, parseAbiParameters, keccak256 } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Load environment variables
config();

// Generate a unique salt based on project-specific details
function generateUniqueSalt() {
  // You can provide your own salt via ENV, but by default we'll generate a more unique one
  if (process.env.FIXED_SALT) {
    return process.env.FIXED_SALT;
  }

  // Generate a more unique salt that's less likely to have been used before
  // Use project name + timestamp + random value as seed
  const projectSeed = "UbiquityPermitAggregator"; // Project-specific seed
  const timestamp = Date.now().toString();
  const randomValue = Math.random().toString().slice(2, 10);

  // Combine these values and hash them to create a salt
  const saltInput = `${projectSeed}-${timestamp}-${randomValue}`;

  // Use node's crypto module to create a hash
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(saltInput).digest('hex');

  return `0x${hash}`;
}

// Generate a unique salt value
const FIXED_SALT = generateUniqueSalt();

// Permit2 address (same on all EVM chains)
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Singleton Factory address (same on all EVM chains)
const SINGLETON_FACTORY_ADDRESS = "0xce0042B868300000d44A59004Da54A005ffdcf9f";

// Chain configurations
const CHAINS = [
  {
    name: "Gnosis Chain",
    chainId: 100,
    rpcUrl: process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com",
    explorer: "https://gnosisscan.io"
  },
  {
    name: "Ethereum Mainnet",
    chainId: 1,
    rpcUrl: process.env.ETH_RPC_URL || "https://rpc.ubq.fi/1",
    explorer: "https://etherscan.io"
  },
  {
    name: "Optimism",
    chainId: 10,
    rpcUrl: process.env.OPTIMISM_RPC_URL || "https://rpc.ubq.fi/10",
    explorer: "https://optimistic.etherscan.io"
  },
  {
    name: "Arbitrum One",
    chainId: 42161,
    rpcUrl: process.env.ARBITRUM_RPC_URL || "https://rpc.ubq.fi/42161",
    explorer: "https://arbiscan.io"
  },
  {
    name: "Polygon",
    chainId: 137,
    rpcUrl: process.env.POLYGON_RPC_URL || "https://rpc.ubq.fi/137",
    explorer: "https://polygonscan.com"
  }
];

/**
 * Compile the PermitAggregator contract
 */
async function compileContract() {
  console.log("Compiling PermitAggregator contract...");

  const contractPath = join(__dirname, "..", "contracts", "PermitAggregator.sol");
  const sourceCode = readFileSync(contractPath, "utf8");

  // Create temp directory for compilation
  const tempDir = join(__dirname, "temp-deploy");
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
 * Calculate the target address using the fixed salt
 */
async function calculateTargetAddress(bytecode: string) {
  console.log(`Calculating deployment address using salt ${FIXED_SALT}...`);

  // Prepare the init code (bytecode + encoded constructor args)
  const encodedArgs = encodeAbiParameters(
    parseAbiParameters(['address']),
    [PERMIT2_ADDRESS]
  ).slice(2); // remove '0x' prefix

  const initCode = `0x${bytecode}${encodedArgs}`;
  const initCodeHash = keccak256(initCode);
  console.log(`Init code hash: ${initCodeHash}`);

  // Calculate the address
  const targetAddress = getCreate2Address({
    from: SINGLETON_FACTORY_ADDRESS,
    salt: FIXED_SALT,
    bytecode: initCode,
  });

  console.log(`\n=================================================`);
  console.log(`DEPLOYMENT TARGET ADDRESS: ${targetAddress}`);
  console.log(`=================================================\n`);
  console.log(`This is the address where the contract will be deployed on all chains.`);

  return { targetAddress, initCode };
}

/**
 * Check if contract is already deployed at the target address
 */
async function checkDeploymentStatus(targetAddress: string) {
  console.log("\nChecking deployment status across chains...");

  const results = [];

  for (const chain of CHAINS) {
    try {
      console.log(`\nChecking ${chain.name}...`);

      const response = await fetch(chain.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getCode",
          params: [targetAddress, "latest"]
        })
      });

      const data = await response.json();
      const bytecode = data.result;

      if (!bytecode || bytecode === "0x") {
        console.log(`- Not deployed on ${chain.name}`);
        results.push({ chain: chain.name, deployed: false });
      } else {
        console.log(`- Already deployed on ${chain.name} (bytecode length: ${bytecode.length} characters)`);
        console.log(`- View at: ${chain.explorer}/address/${targetAddress}#code`);
        results.push({ chain: chain.name, deployed: true });
      }
    } catch (error) {
      console.error(`- Error checking ${chain.name}: ${(error as Error).message}`);
      results.push({ chain: chain.name, deployed: false, error: (error as Error).message });
    }
  }

  return results;
}

/**
 * Generate the command needed to deploy to a specific chain
 */
function generateDeployCommand(chainName: string, chainId: number, targetAddress: string, salt: string) {
  // First check if we have the deployments info file
  const deployInfoPath = join(__dirname, "crosschain-deployment-info.json");

  try {
    // Save info to file for use in verification
    writeFileSync(deployInfoPath, JSON.stringify({
      targetAddress: targetAddress,
      permitAddress: PERMIT2_ADDRESS,
      factoryAddress: SINGLETON_FACTORY_ADDRESS,
      salt: salt,
      compilerVersion: "0.8.20",
      optimizationRuns: 200,
      chains: CHAINS.map(c => ({
        name: c.name,
        chainId: c.chainId,
        explorer: c.explorer
      })),
      createdAt: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    console.error(`Error saving deployment info: ${(error as Error).message}`);
  }

  // Generate deployment commands
  let deployCommand = "";
  let verifyCommand = "";

  switch (chainName.toLowerCase()) {
    case "gnosis chain":
      deployCommand = `CHAIN_ID=100 VERIFY_CHAIN=gnosis bun run scripts/deploy-to-chain.ts`;
      verifyCommand = `VERIFY_CHAIN=gnosis bun run scripts/verify-contract-code.ts`;
      break;
    case "ethereum mainnet":
      deployCommand = `CHAIN_ID=1 VERIFY_CHAIN=ethereum bun run scripts/deploy-to-chain.ts`;
      verifyCommand = `VERIFY_CHAIN=ethereum bun run scripts/verify-contract-code.ts`;
      break;
    case "optimism":
      deployCommand = `CHAIN_ID=10 VERIFY_CHAIN=optimism bun run scripts/deploy-to-chain.ts`;
      verifyCommand = `VERIFY_CHAIN=optimism bun run scripts/verify-contract-code.ts`;
      break;
    case "arbitrum one":
      deployCommand = `CHAIN_ID=42161 VERIFY_CHAIN=arbitrum bun run scripts/deploy-to-chain.ts`;
      verifyCommand = `VERIFY_CHAIN=arbitrum bun run scripts/verify-contract-code.ts`;
      break;
    case "polygon":
      deployCommand = `CHAIN_ID=137 VERIFY_CHAIN=polygon bun run scripts/deploy-to-chain.ts`;
      verifyCommand = `VERIFY_CHAIN=polygon bun run scripts/verify-contract-code.ts`;
      break;
    default:
      deployCommand = `CHAIN_ID=${chainId} bun run scripts/deploy-to-chain.ts`;
      verifyCommand = `(Verification not supported for this chain)`;
  }

  return { deployCommand, verifyCommand };
}

/**
 * Generate the deployment script for a specific chain
 */
function generateDeployScript(initCode: string, salt: string) {
  const deployScriptPath = join(__dirname, "deploy-to-chain.ts");

  const scriptContent = `/**
 * Deploy to Specific Chain Using Fixed Salt
 *
 * This script deploys the PermitAggregator contract to a specific chain using
 * the predefined init code and salt. This ensures the contract is deployed at
 * the same address across all chains.
 */

import { config } from "dotenv";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Load environment variables
config();

// Target chain information
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "100");  // Default to Gnosis Chain
const RPC_URL = CHAIN_ID === 1 ? (process.env.ETH_RPC_URL || "https://rpc.ubq.fi/1") :
               CHAIN_ID === 10 ? (process.env.OPTIMISM_RPC_URL || "https://rpc.ubq.fi/10") :
               CHAIN_ID === 42161 ? (process.env.ARBITRUM_RPC_URL || "https://rpc.ubq.fi/42161") :
               CHAIN_ID === 100 ? (process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com") :
               CHAIN_ID === 137 ? (process.env.POLYGON_RPC_URL || "https://rpc.ubq.fi/137") :
               "https://rpc.ubq.fi/" + CHAIN_ID;

// Salt and factory information
const SINGLETON_FACTORY_ADDRESS = "0xce0042B868300000d44A59004Da54A005ffdcf9f";
const SALT = "${salt}";
const INIT_CODE = "${initCode}";

// Deployer wallet setup
if (!process.env.DEPLOYER_PRIVATE_KEY) {
  console.error("❌ Error: DEPLOYER_PRIVATE_KEY not found in .env file");
  process.exit(1);
}

const privateKey = process.env.DEPLOYER_PRIVATE_KEY.startsWith("0x")
  ? process.env.DEPLOYER_PRIVATE_KEY
  : \`0x\${process.env.DEPLOYER_PRIVATE_KEY}\`;

// Get chain name
function getChainName(chainId: number): string {
  switch (chainId) {
    case 1: return "Ethereum Mainnet";
    case 10: return "Optimism";
    case 42161: return "Arbitrum One";
    case 100: return "Gnosis Chain";
    case 137: return "Polygon";
    default: return \`Chain ID \${chainId}\`;
  }
}

/**
 * Deploy using Singleton Factory
 */
async function deploy() {
  console.log("=================================================");
  console.log(\`Deploying to \${getChainName(CHAIN_ID)}\`);
  console.log("=================================================");
  console.log(\`RPC URL: \${RPC_URL}\`);
  console.log(\`Factory: \${SINGLETON_FACTORY_ADDRESS}\`);
  console.log(\`Salt: \${SALT}\`);
  console.log("=================================================\\n");

  try {
    // Create a wallet client
    const account = privateKeyToAccount(privateKey);
    const client = createWalletClient({
      account,
      chain: {
        id: CHAIN_ID,
        name: getChainName(CHAIN_ID),
        rpcUrls: { default: { http: [RPC_URL] } }
      },
      transport: http()
    });

    const address = await client.getAddressAsync();
    console.log(\`Deployer address: \${address}\`);

    // Check balance
    const balance = await client.getBalanceAsync({ address });
    console.log(\`Balance: \${balance} wei (\${Number(balance) / 1e18} ETH)\`);

    if (balance === BigInt(0)) {
      console.error("❌ Error: Deployer has no ETH. Please fund the account first.");
      return false;
    }

    // Call the Singleton Factory deploy function
    console.log("\\nSubmitting deployment transaction...");
    const txHash = await client.writeContractAsync({
      address: SINGLETON_FACTORY_ADDRESS,
      abi: [
        {
          type: "function",
          name: "deploy",
          inputs: [
            { type: "bytes", name: "_initCode" },
            { type: "bytes32", name: "_salt" }
          ],
          outputs: [{ type: "address", name: "createdContract" }],
          stateMutability: "nonpayable"
        }
      ],
      functionName: "deploy",
      args: [INIT_CODE, SALT],
      value: BigInt(0)
    });

    console.log(\`Transaction sent: \${txHash}\`);
    console.log("Waiting for transaction to be mined...");

    // Wait a bit for the transaction to be mined
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log("\\n=================================================");
    console.log("DEPLOYMENT SUBMITTED");
    console.log("=================================================");
    console.log(\`Chain: \${getChainName(CHAIN_ID)}\`);
    console.log(\`Transaction: \${txHash}\`);

    // Get explorer URL
    let explorerUrl = "";
    switch (CHAIN_ID) {
      case 1: explorerUrl = "https://etherscan.io"; break;
      case 10: explorerUrl = "https://optimistic.etherscan.io"; break;
      case 42161: explorerUrl = "https://arbiscan.io"; break;
      case 100: explorerUrl = "https://gnosisscan.io"; break;
      case 137: explorerUrl = "https://polygonscan.com"; break;
    }

    if (explorerUrl) {
      console.log(\`View on explorer: \${explorerUrl}/tx/\${txHash}\`);
    }

    console.log("\\nRun verification after transaction is confirmed:");
    console.log(\`VERIFY_CHAIN=\${CHAIN_ID === 1 ? "ethereum" : CHAIN_ID === 10 ? "optimism" : CHAIN_ID === 42161 ? "arbitrum" : CHAIN_ID === 100 ? "gnosis" : CHAIN_ID === 137 ? "polygon" : "unsupported"} bun run scripts/verify-contract-code.ts\`);

    return true;
  } catch (error) {
    console.error(\`\\n❌ Deployment error: \${(error as Error).message}\`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

// Run the deployment
deploy().catch(console.error);
`;

  writeFileSync(deployScriptPath, scriptContent);
  console.log(`\nDeployment script generated: ${deployScriptPath}`);

  return deployScriptPath;
}

/**
 * Main function
 */
async function main() {
  console.log("=================================================");
  console.log("Cross-Chain Deployment Using Fixed Salt");
  console.log("=================================================");
  console.log(`Using salt: ${FIXED_SALT}`);
  console.log(`Permit2 address: ${PERMIT2_ADDRESS}`);
  console.log(`Singleton Factory address: ${SINGLETON_FACTORY_ADDRESS}`);
  console.log("=================================================\n");

  try {
    // Compile the contract
    const { bytecode } = await compileContract();

    // Calculate the target address
    const { targetAddress, initCode } = await calculateTargetAddress(bytecode);

    // Check deployment status across chains
    const deploymentStatus = await checkDeploymentStatus(targetAddress);

    // Generate deployment script
    const deployScriptPath = generateDeployScript(initCode, FIXED_SALT);

    // Print deployment commands
    console.log("\n=================================================");
    console.log("DEPLOYMENT COMMANDS");
    console.log("=================================================");

    for (const status of deploymentStatus) {
      if (!status.deployed) {
        const chain = CHAINS.find(c => c.name === status.chain);
        if (chain) {
          const { deployCommand, verifyCommand } = generateDeployCommand(status.chain, chain.chainId, targetAddress, FIXED_SALT);
          console.log(`\n${status.chain}:`);
          console.log(`1. ${deployCommand}`);
          console.log(`2. ${verifyCommand}`);
        }
      } else {
        console.log(`\n${status.chain}: Already deployed ✓`);
      }
    }

    console.log("\n=================================================");
    console.log("NEXT STEPS");
    console.log("=================================================");
    console.log("1. Make sure your .env file contains a funded DEPLOYER_PRIVATE_KEY");
    console.log("2. Execute the deployment commands for each chain");
    console.log("3. Wait for confirmations and run verification");
    console.log("4. The contract will be at the SAME address on all chains:");
    console.log(`   ${targetAddress}`);

    return { success: true, targetAddress };
  } catch (error) {
    console.error(`\n❌ Error: ${(error as Error).message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    return { success: false, error: String(error) };
  }
}

// Run the script
main().catch(console.error);
