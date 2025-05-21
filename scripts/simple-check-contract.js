#!/usr/bin/env node

const { ethers } = require('ethers');

// Target contract address to check
const TARGET_ADDRESS = '0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e';

// Gnosis Chain RPC URL
const RPC_URL = 'https://rpc.gnosischain.com';

// Function to check contract bytecode
async function checkContractBytecode() {
  console.log('=================================================');
  console.log('CHECKING CONTRACT BYTECODE ON GNOSIS CHAIN');
  console.log('=================================================');
  console.log(`Target Address: ${TARGET_ADDRESS}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log('=================================================\n');

  // Create a provider to connect to the network
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  try {
    // Get the bytecode at the target address
    console.log('Retrieving contract bytecode...');
    const bytecode = await provider.getCode(TARGET_ADDRESS);

    if (bytecode === '0x' || bytecode === '0x0') {
      console.error('❌ No contract found at target address');
      return false;
    }

    console.log('✅ Contract bytecode found');
    console.log(`Bytecode length: ${bytecode.length / 2 - 1} bytes`);
    console.log(`Complete bytecode: ${bytecode}`);

    // Analyze the bytecode
    if (bytecode.length < 100) {
      console.log('\nℹ️ This appears to be a minimal proxy or placeholder contract');

      // Check if it's an EIP-1167 minimal proxy
      if (bytecode.startsWith('0x363d3d373d3d3d363d73')) {
        console.log('✅ This is an EIP-1167 minimal proxy contract');

        // Extract the implementation address
        const implementationAddressWithSuffix = bytecode.slice(22);
        const implementationAddress = '0x' + implementationAddressWithSuffix.slice(0, 40);

        console.log(`Implementation address: ${implementationAddress}`);
        console.log(`View implementation: https://gnosisscan.io/address/${implementationAddress}`);

        // Check the implementation contract
        console.log('\nChecking implementation contract...');
        const implBytecode = await provider.getCode(implementationAddress);

        if (implBytecode === '0x' || implBytecode === '0x0') {
          console.error('❌ No contract found at implementation address');
        } else {
          console.log('✅ Implementation contract found');
          console.log(`Implementation bytecode length: ${implBytecode.length / 2 - 1} bytes`);
        }
      }
    } else {
      // For normal contracts, output some analysis
      console.log('\nThis is a standard contract (not a proxy)');

      // Check for common signatures in the bytecode
      if (bytecode.includes('a9059cbb')) {
        console.log('✅ Contract contains ERC20 transfer function signature');
      }

      if (bytecode.includes('095ea7b3')) {
        console.log('✅ Contract contains ERC20 approve function signature');
      }
    }

    return true;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

// Run the function
checkContractBytecode().catch(console.error);
