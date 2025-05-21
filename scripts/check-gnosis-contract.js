#!/usr/bin/env node

const axios = require('axios');

// Target contract address to verify
const TARGET_ADDRESS = '0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e';

// Gnosis Chain API details
const API_URL = 'https://api.gnosisscan.io/api';
const API_KEY = process.env.GNOSISSCAN_API_KEY || '';

async function checkContract() {
  console.log('=================================================');
  console.log('CHECKING CONTRACT ON GNOSIS CHAIN');
  console.log('=================================================');
  console.log(`Target Address: ${TARGET_ADDRESS}`);
  console.log('=================================================\n');

  try {
    // First, check if the contract exists using eth_getCode
    console.log('Checking if contract exists at target address...');

    const codeResponse = await axios.get(API_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getCode',
        address: TARGET_ADDRESS,
        tag: 'latest',
        apikey: API_KEY
      }
    });

    if (codeResponse.data.result === '0x' || codeResponse.data.result === '0x0') {
      console.error('❌ No contract found at target address');
      console.log(`View on GnosisScan: https://gnosisscan.io/address/${TARGET_ADDRESS}`);

      // Also check a few other chain explorers
      console.log('\nChecking if contract exists on other chains...');

      // Ethereum Mainnet
      const ethResponse = await axios.get('https://api.etherscan.io/api', {
        params: {
          module: 'proxy',
          action: 'eth_getCode',
          address: TARGET_ADDRESS,
          tag: 'latest',
          apikey: process.env.ETHERSCAN_API_KEY || ''
        }
      }).catch(() => ({ data: { result: '0x' } }));

      if (ethResponse.data.result !== '0x' && ethResponse.data.result !== '0x0') {
        console.log('✅ Contract found on Ethereum Mainnet');
        console.log(`View contract: https://etherscan.io/address/${TARGET_ADDRESS}`);
      } else {
        console.log('❌ Not found on Ethereum Mainnet');
      }

      // Optimism
      const optimismResponse = await axios.get('https://api-optimistic.etherscan.io/api', {
        params: {
          module: 'proxy',
          action: 'eth_getCode',
          address: TARGET_ADDRESS,
          tag: 'latest',
          apikey: process.env.OPTIMISTIC_ETHERSCAN_API_KEY || ''
        }
      }).catch(() => ({ data: { result: '0x' } }));

      if (optimismResponse.data.result !== '0x' && optimismResponse.data.result !== '0x0') {
        console.log('✅ Contract found on Optimism');
        console.log(`View contract: https://optimistic.etherscan.io/address/${TARGET_ADDRESS}`);
      } else {
        console.log('❌ Not found on Optimism');
      }
    } else {
      console.log('✅ Contract found at target address on Gnosis Chain');
      console.log(`Bytecode length: ${codeResponse.data.result.length / 2 - 1} bytes`);
      console.log(`View contract: https://gnosisscan.io/address/${TARGET_ADDRESS}`);

      // Try to get contract details
      try {
        const contractDetailsResponse = await axios.get(API_URL, {
          params: {
            module: 'contract',
            action: 'getsourcecode',
            address: TARGET_ADDRESS,
            apikey: API_KEY
          }
        });

        if (contractDetailsResponse.data.status === '1' &&
            contractDetailsResponse.data.result &&
            contractDetailsResponse.data.result.length > 0) {

          const contractInfo = contractDetailsResponse.data.result[0];

          console.log('\nContract Details:');
          console.log(`Contract Name: ${contractInfo.ContractName || 'N/A'}`);
          console.log(`Compiler Version: ${contractInfo.CompilerVersion || 'N/A'}`);
          console.log(`Verified: ${contractInfo.ABI === 'Contract source code not verified' ? 'No' : 'Yes'}`);

          if (contractInfo.Implementation) {
            console.log(`Implementation: ${contractInfo.Implementation}`);
            console.log('This is a proxy contract');
          }
        }
      } catch (error) {
        console.log('\nCould not retrieve contract details');
      }
    }
  } catch (error) {
    console.error('Error checking contract:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the function
checkContract().catch(console.error);
