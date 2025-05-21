import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Target contract address to verify
const TARGET_ADDRESS = '0xfa3b31d5b9f91c78360d618b5d6e74cbe930e10e';

// Standard Permit2 address used as constructor argument
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Chain configuration
const CHAIN = process.env.VERIFY_CHAIN || 'gnosis';

// Chain-specific API configuration
const API_CONFIG = {
  gnosis: {
    apiUrl: 'https://api.gnosisscan.io/api',
    apiKey: process.env.GNOSISSCAN_API_KEY || '',
    browserUrl: 'https://gnosisscan.io'
  },
  ethereum: {
    apiUrl: 'https://api.etherscan.io/api',
    apiKey: process.env.ETHERSCAN_API_KEY || '',
    browserUrl: 'https://etherscan.io'
  },
  optimism: {
    apiUrl: 'https://api-optimistic.etherscan.io/api',
    apiKey: process.env.OPTIMISTIC_ETHERSCAN_API_KEY || '',
    browserUrl: 'https://optimistic.etherscan.io'
  }
};

async function main() {
  if (!(CHAIN in API_CONFIG)) {
    console.error(`Unsupported chain: ${CHAIN}`);
    console.error('Supported chains: gnosis, ethereum, optimism');
    process.exit(1);
  }

  const config = API_CONFIG[CHAIN];

  if (!config.apiKey) {
    console.error(`API key for ${CHAIN} not found in environment variables`);
    console.error(`Set ${CHAIN.toUpperCase()}SCAN_API_KEY in your .env file`);
    process.exit(1);
  }

  console.log(`=================================================`);
  console.log(`VERIFYING CONTRACT ON ${CHAIN.toUpperCase()}`);
  console.log(`=================================================`);
  console.log(`Target Address: ${TARGET_ADDRESS}`);
  console.log(`${CHAIN}scan API: ${config.apiUrl}`);
  console.log(`=================================================\n`);

  // Step 1: Check if the contract exists
  try {
    console.log('Checking if contract exists...');
    const response = await axios.get(config.apiUrl, {
      params: {
        module: 'proxy',
        action: 'eth_getCode',
        address: TARGET_ADDRESS,
        tag: 'latest',
        apikey: config.apiKey
      }
    });

    if (response.data.result === '0x' || response.data.result === '0x0') {
      console.error(`❌ No contract found at address ${TARGET_ADDRESS}`);
      console.log(`View on ${config.browserUrl}/address/${TARGET_ADDRESS}`);
      process.exit(1);
    }

    console.log('✅ Contract found at target address');
    console.log(`Bytecode length: ${response.data.result.length / 2 - 1} bytes\n`);
  } catch (error) {
    console.error('Error checking contract code:', error.message);
    process.exit(1);
  }

  // Step 2: Read contract source from file
  const contractPath = path.join(process.cwd(), 'contracts', 'PermitAggregator.sol');

  if (!fs.existsSync(contractPath)) {
    console.error(`❌ Contract file not found at ${contractPath}`);
    process.exit(1);
  }

  const sourceCode = fs.readFileSync(contractPath, 'utf8');
  console.log('Contract source code loaded successfully');

  // Step 3: Compile settings
  const compilerVersion = '0.8.20'; // Extract from pragma if needed
  const optimizationUsed = 1;
  const runs = 200;

  // Step 4: Submit verification request
  console.log('\nSubmitting verification request...');

  try {
    const verificationResponse = await axios.post(config.apiUrl, null, {
      params: {
        module: 'contract',
        action: 'verifysourcecode',
        contractaddress: TARGET_ADDRESS,
        sourceCode: sourceCode,
        codeformat: 'solidity-single-file',
        contractname: 'PermitAggregator',
        compilerversion: `v${compilerVersion}`,
        optimizationused: optimizationUsed,
        runs: runs,
        constructorArguments: PERMIT2_ADDRESS.slice(2), // Remove 0x prefix
        licenseType: 3, // MIT License
        apikey: config.apiKey
      }
    });

    if (verificationResponse.data.status === '1') {
      console.log('✅ Verification request submitted successfully');
      console.log(`Verification GUID: ${verificationResponse.data.result}`);

      // Create a log file with the verification result
      const logPath = path.join(process.cwd(), 'verify-output.log');
      fs.writeFileSync(logPath, JSON.stringify(verificationResponse.data, null, 2));

      console.log('\nChecking verification status...');
      await checkVerificationStatus(verificationResponse.data.result, config);
    } else {
      console.error(`❌ Verification request failed: ${verificationResponse.data.result}`);
    }
  } catch (error) {
    console.error('Error submitting verification request:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

async function checkVerificationStatus(guid: string, config: any) {
  let retries = 5;
  let verified = false;

  while (retries > 0) {
    try {
      const statusResponse = await axios.get(config.apiUrl, {
        params: {
          module: 'contract',
          action: 'checkverifystatus',
          guid: guid,
          apikey: config.apiKey
        }
      });

      if (statusResponse.data.result === 'Pending in queue') {
        console.log('Verification still pending. Waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        retries--;
      } else if (statusResponse.data.result.includes('Successfully verified')) {
        console.log('\n✅ Contract successfully verified!');
        console.log(`View verified contract on ${config.browserUrl}/address/${TARGET_ADDRESS}#code`);
        verified = true;
        break;
      } else {
        console.error(`❌ Verification failed: ${statusResponse.data.result}`);
        break;
      }
    } catch (error) {
      console.error('Error checking verification status:', error.message);
      retries--;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  if (!verified && retries === 0) {
    console.log('\nStatus check timed out. The verification might still be processing.');
    console.log(`Check manually on ${config.browserUrl}/address/${TARGET_ADDRESS}#code`);
  }
}

main().catch(console.error);
