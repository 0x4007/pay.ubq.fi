#!/bin/bash
# Redeploy and verify PermitAggregator contract on Ethereum Mainnet
#
# This script handles the setup and execution of the redeployment process

# Ensure we're in the project root directory
cd "$(dirname "$0")/.." || exit 1
echo "Working directory: $(pwd)"

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo "Error: .env file not found. Creating one from .env.example..."
  cp .env.example .env
  echo ""
  echo "Please edit the .env file and add your DEPLOYER_PRIVATE_KEY and ETHERSCAN_API_KEY, then run this script again."
  echo "You need to fund your deployer address with some ETH for transaction fees."
  exit 1
fi

# Check if DEPLOYER_PRIVATE_KEY is set in .env
if ! grep -q "DEPLOYER_PRIVATE_KEY=" .env || grep -q "DEPLOYER_PRIVATE_KEY=$" .env; then
  echo "Error: DEPLOYER_PRIVATE_KEY is not set in .env file."
  echo "Please edit the .env file and add your DEPLOYER_PRIVATE_KEY, then run this script again."
  exit 1
fi

# Check if ETHERSCAN_API_KEY is set in .env
if ! grep -q "ETHERSCAN_API_KEY=" .env || grep -q "ETHERSCAN_API_KEY=$" .env; then
  echo "Warning: ETHERSCAN_API_KEY is not set in .env file."
  echo "Contract verification will be skipped."
  echo "To enable verification, add your ETHERSCAN_API_KEY to the .env file."
fi

# Install dependencies if not already installed
echo "Checking dependencies..."
if ! bun list | grep -q "viem"; then
  echo "Installing dependencies..."
  bun add viem axios solc
fi

# Run the deployment script
echo ""
echo "=== Starting Deployment and Verification on Ethereum Mainnet ==="
echo ""
echo "⚠️  WARNING: This operation will deploy to Ethereum Mainnet and consume real ETH ⚠️"
echo "Are you sure you want to continue? (y/n)"
read -r confirmation

if [[ $confirmation != "y" ]]; then
  echo "Deployment canceled."
  exit 0
fi

echo "Continuing with deployment..."
bun run scripts/redeploy-mainnet.ts

# Check the result
if [ $? -eq 0 ]; then
  echo ""
  echo "Deployment process completed. Check the output above for details."
  echo "The deployment information is saved in scripts/mainnet-deployment-result.json"
else
  echo ""
  echo "Deployment process failed. Please check the error messages above."
fi
