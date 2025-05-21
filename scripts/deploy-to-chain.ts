/**
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
const SALT = "0x893b4bb9afb019242576c3e8ff09eb367051ae5ed7e188e9380748860958b752";
const INIT_CODE = "0x60a060405234801561000f575f80fd5b50604051610a23380380610a2383398101604081905261002e9161003f565b6001600160a01b031660805261006c565b5f6020828403121561004f575f80fd5b81516001600160a01b0381168114610065575f80fd5b9392505050565b60805161099961008a5f395f8181604801526103ae01526109995ff3fe608060405234801561000f575f80fd5b506004361061003f575f3560e01c80636afdd85014610043578063b003fa4a14610086578063b17a64d81461009b575b5f80fd5b61006a7f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b03909116815260200160405180910390f35b6100996100943660046106a9565b6100ae565b005b6100996100a93660046106a9565b6101fd565b5f5460ff16156101055760405162461bcd60e51b815260206004820152601f60248201527f5265656e7472616e637947756172643a207265656e7472616e742063616c6c0060448201526064015b60405180910390fd5b5f805460ff191660011790558382146101525760405162461bcd60e51b815260206004820152600f60248201526e098cadccee8d040dad2e6dac2e8c6d608b1b60448201526064016100fc565b836101955760405162461bcd60e51b8152602060048201526013602482015272139bc81c195c9b5a5d1cc81cd95b1958dd1959606a1b60448201526064016100fc565b5f806101a4878787878761029c565b91509150826001600160a01b03167f2be0b4cdbc196dfc46032a8fa74cc82adaafd516963130bcc423ebf64e71b0c083836040516101e392919061074f565b60405180910390a250505f805460ff191690555050505050565b5f5460ff161561024f5760405162461bcd60e51b815260206004820152601f60248201527f5265656e7472616e637947756172643a207265656e7472616e742063616c6c0060448201526064016100fc565b5f805460ff191660011790558382146101955760405162461bcd60e51b815260206004820152600f60248201526e098cadccee8d040dad2e6dac2e8c6d608b1b60448201526064016100fc565b606080858067ffffffffffffffff8111156102b9576102b96107d1565b6040519080825280602002602001820160405280156102e2578160200160208202803683370190505b5092508067ffffffffffffffff8111156102fe576102fe6107d1565b604051908082528060200260200182016040528015610327578160200160208202803683370190505b5091505f805b8281101561056357368a8a83818110610348576103486107e5565b60e00291909101915030905061036460408301602084016107f9565b6001600160a01b0316146103ac5760405162461bcd60e51b815260206004820152600f60248201526e24b73b30b634b21039b832b73232b960891b60448201526064016100fc565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031663b38c9745828b8b868181106103ee576103ee6107e5565b90506020028101906104009190610819565b6040518463ffffffff1660e01b815260040161041e9392919061085c565b5f604051808303815f87803b158015610435575f80fd5b505af1158015610447573d5f803e3d5ffd5b505050505f805b848110156104db5761046360208401846107f9565b6001600160a01b031688828151811061047e5761047e6107e5565b60200260200101516001600160a01b0316036104cb5782604001358782815181106104ab576104ab6107e5565b602002602001018181516104bf9190610913565b905250600191506104db565b6104d48161092c565b905061044e565b5080610550576104ee60208301836107f9565b878581518110610500576105006107e5565b60200260200101906001600160a01b031690816001600160a01b0316815250508160400135868581518110610537576105376107e5565b60209081029190910101528361054c8161092c565b9450505b50508061055c9061092c565b905061032d565b505f5b8181101561063357848181518110610580576105806107e5565b60200260200101516001600160a01b031663a9059cbb878684815181106105a9576105a96107e5565b60200260200101516040518363ffffffff1660e01b81526004016105e29291906001600160a01b03929092168252602082015260400190565b6020604051808303815f875af11580156105fe573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906106229190610944565b5061062c8161092c565b9050610566565b5080845280835250509550959350505050565b5f8083601f840112610656575f80fd5b50813567ffffffffffffffff81111561066d575f80fd5b6020830191508360208260051b8501011115610687575f80fd5b9250929050565b80356001600160a01b03811681146106a4575f80fd5b919050565b5f805f805f606086880312156106bd575f80fd5b853567ffffffffffffffff808211156106d4575f80fd5b818801915088601f8301126106e7575f80fd5b8135818111156106f5575f80fd5b89602060e083028501011115610709575f80fd5b602092830197509550908701359080821115610723575f80fd5b5061073088828901610646565b909450925061074390506040870161068e565b90509295509295909350565b604080825283519082018190525f906020906060840190828701845b828110156107905781516001600160a01b03168452928401929084019060010161076b565b505050838103828501528451808252858301918301905f5b818110156107c4578351835292840192918401916001016107a8565b5090979650505050505050565b634e487b7160e01b5f52604160045260245ffd5b634e487b7160e01b5f52603260045260245ffd5b5f60208284031215610809575f80fd5b6108128261068e565b9392505050565b5f808335601e1984360301811261082e575f80fd5b83018035915067ffffffffffffffff821115610848575f80fd5b602001915036819003821315610687575f80fd5b5f6101006001600160a01b03806108728861068e565b168452806108826020890161068e565b166020850152604087013560408501526060870135606085015260808701356080850152806108b360a0890161068e565b1660a0850152806108c660c0890161068e565b1660c0850152508060e08401528381840152506101208385828501375f838501820152601f909301601f19169091019091019392505050565b634e487b7160e01b5f52601160045260245ffd5b80820180821115610926576109266108ff565b92915050565b5f6001820161093d5761093d6108ff565b5060010190565b5f60208284031215610954575f80fd5b81518015158114610812575f80fdfea26469706673582212207587ad21e2c5a7bf26ed8ca34a1da1e4f26764bae9bf3d40f31a1892ed7a070564736f6c63430008140033000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3";

// Deployer wallet setup
if (!process.env.DEPLOYER_PRIVATE_KEY) {
  console.error("❌ Error: DEPLOYER_PRIVATE_KEY not found in .env file");
  process.exit(1);
}

// Make sure we have a valid private key format (64 hex chars with 0x prefix)
let privateKey = process.env.DEPLOYER_PRIVATE_KEY || "";
if (!privateKey) {
  console.error("❌ Error: DEPLOYER_PRIVATE_KEY not found in .env file");
  process.exit(1);
}

// Add 0x prefix if it's missing
if (!privateKey.startsWith("0x")) {
  privateKey = `0x${privateKey}`;
}

// Check if it's a valid format (should be 66 chars including 0x prefix for a 32-byte key)
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  console.error("❌ Error: Invalid private key format. Must be 64 hex characters (without 0x prefix)");
  console.error("Example format: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  process.exit(1);
}

// Get chain name
function getChainName(chainId: number): string {
  switch (chainId) {
    case 1: return "Ethereum Mainnet";
    case 10: return "Optimism";
    case 42161: return "Arbitrum One";
    case 100: return "Gnosis Chain";
    case 137: return "Polygon";
    default: return `Chain ID ${chainId}`;
  }
}

/**
 * Deploy using Singleton Factory
 */
async function deploy() {
  console.log("=================================================");
  console.log(`Deploying to ${getChainName(CHAIN_ID)}`);
  console.log("=================================================");
  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Factory: ${SINGLETON_FACTORY_ADDRESS}`);
  console.log(`Salt: ${SALT}`);
  console.log("=================================================\n");

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

    const address = await client.getAddress();
    console.log(`Deployer address: ${address}`);

    // Check balance
    const balance = await client.getBalance({ address });
    console.log(`Balance: ${balance} wei (${Number(balance) / 1e18} ETH)`);

    if (balance === BigInt(0)) {
      console.error("❌ Error: Deployer has no ETH. Please fund the account first.");
      return false;
    }

    // Call the Singleton Factory deploy function
    console.log("\nSubmitting deployment transaction...");
    const txHash = await client.writeContract({
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

    console.log(`Transaction sent: ${txHash}`);
    console.log("Waiting for transaction to be mined...");

    // Wait a bit for the transaction to be mined
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log("\n=================================================");
    console.log("DEPLOYMENT SUBMITTED");
    console.log("=================================================");
    console.log(`Chain: ${getChainName(CHAIN_ID)}`);
    console.log(`Transaction: ${txHash}`);

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
      console.log(`View on explorer: ${explorerUrl}/tx/${txHash}`);
    }

    console.log("\nRun verification after transaction is confirmed:");
    console.log(`VERIFY_CHAIN=${CHAIN_ID === 1 ? "ethereum" : CHAIN_ID === 10 ? "optimism" : CHAIN_ID === 42161 ? "arbitrum" : CHAIN_ID === 100 ? "gnosis" : CHAIN_ID === 137 ? "polygon" : "unsupported"} bun run scripts/verify-contract-code.ts`);

    return true;
  } catch (error) {
    console.error(`\n❌ Deployment error: ${(error as Error).message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

// Run the deployment
deploy().catch(console.error);
