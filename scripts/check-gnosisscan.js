#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Target contract address to verify
const TARGET_ADDRESS = '0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e';

// Gnosis Chain API details
const API_URL = 'https://api.gnosisscan.io/api';
const API_KEY = process.env.GNOSISSCAN_API_KEY || '';
const BROWSER_URL = 'https://gnosisscan.io';

// Function to display contract details
async function getContractDetails() {
  console.log('=================================================');
  console.log('CONTRACT DETAILS ON GNOSIS CHAIN');
  console.log('=================================================');
  console.log(`Target Address: ${TARGET_ADDRESS}`);
  console.log(`Explorer: ${BROWSER_URL}/address/${TARGET_ADDRESS}`);
  console.log('=================================================\n');

  try {
    // First, check if the contract exists using eth_getCode
    console.log('1. Checking contract code...');

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
      return false;
    }

    console.log('✅ Contract bytecode found');
    console.log(`Bytecode length: ${codeResponse.data.result.length / 2 - 1} bytes`);
    console.log(`Bytecode preview: ${codeResponse.data.result.substring(0, 50)}...`);

    // Check if it's a proxy/minimal contract
    if (codeResponse.data.result.length < 100) {
      console.log('ℹ️ This appears to be a minimal proxy or placeholder contract');
    }

    // Next, get contract source code info
    console.log('\n2. Checking if contract is verified...');

    const sourceResponse = await axios.get(API_URL, {
      params: {
        module: 'contract',
        action: 'getsourcecode',
        address: TARGET_ADDRESS,
        apikey: API_KEY
      }
    });

    if (sourceResponse.data.status !== '1' || !sourceResponse.data.result || sourceResponse.data.result.length === 0) {
      console.error('❌ Could not retrieve contract source code information');
      return false;
    }

    const contractInfo = sourceResponse.data.result[0];

    console.log('Contract Details:');
    console.log(`- Contract Name: ${contractInfo.ContractName || 'N/A'}`);
    console.log(`- Compiler Version: ${contractInfo.CompilerVersion || 'N/A'}`);
    console.log(`- Optimization: ${contractInfo.OptimizationUsed === '1' ? 'Yes' : 'No'}`);

    if (contractInfo.Implementation && contractInfo.Implementation !== '') {
      console.log(`- Implementation: ${contractInfo.Implementation}`);
      console.log('ℹ️ This is a proxy contract');
    }

    const isVerified = contractInfo.ABI && contractInfo.ABI !== 'Contract source code not verified';

    if (isVerified) {
      console.log('✅ Contract is verified');
      console.log(`- License Type: ${contractInfo.LicenseType || 'Not specified'}`);

      // Create a log file with the contract source code
      const logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
      }

      const sourceCodeFile = path.join(logDir, `${TARGET_ADDRESS}_source.sol`);
      fs.writeFileSync(sourceCodeFile, contractInfo.SourceCode || 'No source code available');

      console.log(`\nSource code saved to ${sourceCodeFile}`);

      // Get ABI and save it too
      if (contractInfo.ABI && contractInfo.ABI !== 'Contract source code not verified') {
        const abiFile = path.join(logDir, `${TARGET_ADDRESS}_abi.json`);
        fs.writeFileSync(abiFile, contractInfo.ABI);
        console.log(`ABI saved to ${abiFile}`);
      }
    } else {
      console.log('❌ Contract is not verified');
      console.log('\n3. Attempting to compare with local contract...');

      // Check if we have a matching contract locally
      const localContractPath = path.join(process.cwd(), 'contracts', 'PermitAggregator.sol');

      if (!fs.existsSync(localContractPath)) {
        console.error('❌ Local contract file not found');
        return false;
      }

      const localContractCode = fs.readFileSync(localContractPath, 'utf8');
      console.log('✅ Local contract loaded from:', localContractPath);

      // Get constructor args to check if they match
      console.log('\n4. Getting transaction details to determine constructor arguments...');

      const txListResponse = await axios.get(API_URL, {
        params: {
          module: 'account',
          action: 'txlist',
          address: TARGET_ADDRESS,
          startblock: '0',
          endblock: '99999999',
          sort: 'asc',
          apikey: API_KEY
        }
      }).catch(err => {
        console.error('Error getting transaction list:', err.message);
        return { data: { result: [] } };
      });

      if (txListResponse.data.status === '1' && txListResponse.data.result && txListResponse.data.result.length > 0) {
        // Look for contract creation transaction
        const creationTx = txListResponse.data.result.find(tx => tx.to === '' || tx.to === null);

        if (creationTx) {
          console.log(`Contract creation transaction found: ${creationTx.hash}`);
          console.log(`- From: ${creationTx.from}`);
          console.log(`- Block Number: ${creationTx.blockNumber}`);
          console.log(`- Timestamp: ${new Date(creationTx.timeStamp * 1000).toISOString()}`);

          // Check the permit2 address in our local contract
          // This is a simplistic check assuming the constructor takes a Permit2 address
          const permit2AddressMatch = localContractCode.match(/0x000000000022D473030F116dDEE9F6B43aC78BA3/i);

          if (permit2AddressMatch) {
            console.log('\n✅ Local contract contains standard Permit2 address');
            console.log('The local contract may match the deployed contract');

            console.log('\n5. Verification information:');
            console.log('To verify this contract on GnosisScan, use:');
            console.log(`\nVERIFY_CHAIN=gnosis TARGET_ADDRESS=${TARGET_ADDRESS} bun run scripts/verify-target-contract.ts`);
          } else {
            console.log('\n❌ Local contract does not contain standard Permit2 address');
            console.log('Check if the constructor arguments might be different');
          }
        } else {
          console.log('❌ Could not find contract creation transaction');
        }
      } else {
        console.log('❌ Could not retrieve transaction list for contract');
      }
    }

    return true;
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

// Run the script
getContractDetails().catch(console.error);
