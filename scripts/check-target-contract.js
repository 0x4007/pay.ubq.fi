#!/usr/bin/env node

// Use correct target address from the latest cross-chain deployment
const TARGET_ADDRESS = '0x17e04Bcb99c389986A3d7E336aACE8F2a1538CD5';

// Gnosis Chain RPC URL
const RPC_URL = 'https://rpc.gnosischain.com';

// Function to check contract bytecode using direct JSON-RPC call
async function checkContractBytecode() {
  console.log('=================================================');
  console.log('CHECKING CONTRACT BYTECODE ON GNOSIS CHAIN');
  console.log('=================================================');
  console.log(`Target Address: ${TARGET_ADDRESS}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log('=================================================\n');

  try {
    console.log('Retrieving contract bytecode...');

    // Make a JSON-RPC call to get the bytecode
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [TARGET_ADDRESS, 'latest'],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const bytecode = data.result;

    if (!bytecode || bytecode === '0x' || bytecode === '0x0') {
      console.error('❌ No contract found at target address');
      return false;
    }

    console.log('✅ Contract bytecode found');
    console.log(`Bytecode length: ${bytecode.length / 2 - 1} bytes`);
    console.log(`Complete bytecode: ${bytecode}`);

    // Analyze the bytecode
    if (bytecode.length < 100) {
      console.log('\nℹ️ This appears to be a minimal proxy or placeholder contract');
    } else {
      console.log('\nThis is a standard contract (not a proxy)');
    }

    // Try to check other chains as well
    console.log('\nChecking on Ethereum Mainnet...');
    const ethResponse = await checkOnChain('https://rpc.ubq.fi/1');
    console.log('\nChecking on Optimism...');
    const optimismResponse = await checkOnChain('https://rpc.ubq.fi/10');

    return true;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

// Helper function to check the contract on other chains
async function checkOnChain(rpcUrl) {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [TARGET_ADDRESS, 'latest'],
        id: 1,
      }),
    });

    if (!response.ok) {
      console.log(`❌ Failed to connect to ${rpcUrl}`);
      return false;
    }

    const data = await response.json();
    const bytecode = data.result;

    if (!bytecode || bytecode === '0x' || bytecode === '0x0') {
      console.log(`❌ No contract found at ${TARGET_ADDRESS} on ${rpcUrl}`);
      return false;
    }

    console.log(`✅ Contract found on ${rpcUrl}`);
    console.log(`Bytecode length: ${bytecode.length / 2 - 1} bytes`);
    return true;
  } catch (error) {
    console.log(`❌ Error checking ${rpcUrl}: ${error.message}`);
    return false;
  }
}

// Run the function
checkContractBytecode().catch(console.error);
