import { JsonRpcProvider } from "@ethersproject/providers";
import { Contract, ethers } from "ethers";
import { erc20Abi } from "../abis";
import { useFastestRpc } from "../rpc-optimization/get-optimal-provider";
import { App } from "../app-state";

export class GetErc20ContractWrapper {
  private _contract: Contract;
  private _contractAddress: string;
  static _provider: [JsonRpcProvider, string];

  constructor(contractAddress: string, provider: [JsonRpcProvider, string]) {
    this._contractAddress = contractAddress;
    GetErc20ContractWrapper._provider = provider;
    this._contract = new ethers.Contract(contractAddress, erc20Abi, GetErc20ContractWrapper._provider[0]);
  }

  async switchProvider(app: App): Promise<void> {
    // Get the URL of the bad provider
    const badProviderUrl = GetErc20ContractWrapper._provider[1];

    // Get the latencies object from the local storage
    const latencies = JSON.parse(localStorage.getItem("rpcLatencies") || "{}");

    // Remove the bad provider from the latencies object
    delete latencies[`${app.networkId}_${badProviderUrl}`];

    // Save the latencies object back to the local storage
    localStorage.setItem("rpcLatencies", JSON.stringify(latencies));

    // Switch to the fastest provider
    GetErc20ContractWrapper._provider = await useFastestRpc(app);
    this._contract = new ethers.Contract(this._contractAddress, erc20Abi, GetErc20ContractWrapper._provider[0]);
  }

  getContract(): Contract {
    return this._contract;
  }
  getProviderUrl(): string {
    return GetErc20ContractWrapper._provider[1];
  }
}
