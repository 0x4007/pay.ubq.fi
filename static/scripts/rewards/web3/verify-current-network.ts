import { Web3Provider } from "@ethersproject/providers";
import invalidateButton from "../invalidate-component";
import { showLoader, toaster } from "../toaster";
import { handleIfOnCorrectNetwork } from "./handle-if-on-correct-network";
import { notOnCorrectNetwork } from "./not-on-correct-network";

// verifyCurrentNetwork checks if the user is on the correct network and displays an error if not
export async function verifyCurrentNetwork(wallet: Web3Provider, networkId: number) {
  if (!wallet || !wallet.provider.isMetaMask) {
    showLoader();
    toaster.create("info", "Please connect to MetaMask.");
    invalidateButton.disabled = true;
    return;
  }

  const network = await wallet.getNetwork();
  const currentNetworkId = network.chainId;

  // watch for network changes
  window.ethereum.on("chainChanged", <T>(newNetworkId: T | string) => handleIfOnCorrectNetwork(parseInt(newNetworkId as string, 16), desiredNetworkId));

  // if its not on ethereum mainnet, gnosis, or goerli, display error
  notOnCorrectNetwork(currentNetworkId, networkId, wallet);
}
