import { JsonRpcProvider } from "@ethersproject/providers";
import { App } from "../app-state";
import { getFastestRpcProvider } from "./get-fastest-rpc-provider";
import { testRpcPerformance } from "./test-rpc-performance";

let isTestStarted = false;
let isTestCompleted = false;

export async function useFastestRpc(app: App): Promise<[JsonRpcProvider, string]> {
  const networkId = app.networkId;

  if (!networkId) throw new Error("Network ID not found");

  if (!isTestCompleted && !isTestStarted) {
    isTestStarted = true;
    await testRpcPerformance(networkId).catch(console.error);
    isTestCompleted = true;
  }

  const optimalRPC = getFastestRpcProvider(networkId);
  return [optimalRPC, optimalRPC.connection.url];
}
