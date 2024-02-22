import { JsonRpcProvider, JsonRpcSigner, Web3Provider } from "@ethersproject/providers";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { ethers } from "ethers";
import { networkExplorers } from "./constants";
import { setClaimMessage } from "./render-transaction/set-claim-message";
import { RewardPermit as Reward, claimTxT } from "./render-transaction/tx-type";
import { useFastestRpc } from "./rpc-optimization/get-optimal-provider";
import { toaster } from "./toaster";
import { verifyCurrentNetwork } from "./web3/verify-current-network";

// type TableStates =
//   | "initializing"
//   | "claim rendered"
//   | "details not visible"
//   | "details visible"
//   | "contract loaded"
//   | "no claim data"
//   | "claim error"
//   | "claim ok";

export class App {
  public table = document.getElementsByTagName(`table`)[0]; // main claims table
  public wallet: Web3Provider | null = null; // user local wallet
  public signer: JsonRpcSigner | null = null; // user local wallet ready to sign transactions
  public rpc: Promise<[JsonRpcProvider, string]>; // RPC provider and its URL
  public claims: Reward[] = []; // list of permits
  private _claimIndex = 0; // current permit index

  // private _tableState: TableStates = "initializing"; // table state

  // set state(value: TableStates) {
  //   this.table.setAttribute(`data-state`, value);
  //   this._tableState = value;
  // }

  // get state(): TableStates {
  //   return this._tableState;
  // }

  constructor() {
    // parse claim data from URL

    const urlParams = new URLSearchParams(window.location.search);
    const base64encodedTxData = urlParams.get("claim");

    if (!base64encodedTxData) {
      setClaimMessage({ type: "Notice", message: `No claim data found.` });
      // this.state = "no claim data";
      app.table.setAttribute(`data-claim`, "none");
      throw new Error("No claim data found.");
    } else {
      this.claims = decodeClaimData(base64encodedTxData);
    }

    // init web3

    if (window.ethereum) {
      this.wallet = new ethers.providers.Web3Provider(window.ethereum);
      // this.rpc = this.wallet; // Set the default RPC provider to be the wallet
      this.signer = this.wallet.getSigner();
      verifyCurrentNetwork(this.wallet, this.networkId).catch(console.error);
    } else {
      toaster.create("info", "No wallet found.");
      // this.table.setAttribute(`data-claim`, "error");
      // toaster.create("info", "Please use a web3 enabled browser to collect this reward.");
      // toaster.create("info", "Please connect your wallet to collect this reward.");
      // throw new Error("No wallet found.");
    }
    this.rpc = useFastestRpc(this);
  }

  get networkId(): number {
    return this.reward.networkId;
  }

  get permitIndex(): number {
    return this._claimIndex;
  }

  get reward(): Reward {
    if (this.permitIndex < this.claims.length) {
      return this.claims[this.permitIndex];
    } else {
      return this.claims[0];
    }
  }

  get currentExplorerUrl(): string {
    if (!this.reward) {
      return "https://etherscan.io";
    }
    return networkExplorers[this.reward.networkId] || "https://etherscan.io";
  }

  nextReward(): Reward | null {
    this._claimIndex = Math.min(this.claims.length - 1, this._claimIndex + 1);
    return this.reward;
  }

  previousReward(): Reward | null {
    this._claimIndex = Math.max(0, this._claimIndex - 1);
    return this.reward;
  }
}

export const app = new App();

function decodeClaimData(base64encodedTxData: string) {
  try {
    return Value.Decode(Type.Array(claimTxT), JSON.parse(atob(base64encodedTxData)));
  } catch (error) {
    console.error(error);
    setClaimMessage({ type: "Error", message: `Invalid claim data passed in URL` });
    // app.state = "no claim data";
    app.table.setAttribute(`data-claim`, "error");
    throw error;
  }
}
