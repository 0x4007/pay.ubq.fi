import { ethers } from "ethers";

export function getFastestRpcProvider(networkId: number) {
  const latencies: Record<string, number> = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");

  const validLatencies = Object.entries(latencies).filter(([key, latency]) => latency >= 0 && key.startsWith(`${networkId}_`));

  const sortedLatencies = validLatencies.sort((a, b) => a[1] - b[1]);
  const optimalRPC = sortedLatencies[0][0].split("_").slice(1).join("_"); // Remove the network ID from the key

  return new ethers.providers.JsonRpcProvider(optimalRPC, {
    name: optimalRPC,
    chainId: networkId,
  });
}
