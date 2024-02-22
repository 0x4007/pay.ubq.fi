import { JsonRpcSigner, TransactionResponse } from "@ethersproject/providers";
import { BigNumber, BigNumberish, Contract, ethers } from "ethers";
import { permit2Abi } from "../abis";
import { app } from "../app-state";
import { networkRpcs, permit2Address } from "../constants";
import invalidateButton from "../invalidate-component";
import { tokens } from "../render-transaction/render-token-symbol";
import { renderTransaction } from "../render-transaction/render-transaction";
import { MetaMaskError, claimButton, errorToast, showLoader, toaster } from "../toaster";
import { GetErc20ContractWrapper } from "./get-erc20-contract";

export interface SponsorWallet {
  balance: BigNumber;
  allowance: BigNumber;
  decimals: number;
  symbol: string;
}
let attemptsRemaining = networkRpcs[app.networkId].length;

export async function fetchSponsorWallet() {
  const reward = app.reward;
  const tokenAddress = reward.permit.permitted.token.toLowerCase();
  const tokenContractWrapper = new GetErc20ContractWrapper(tokenAddress, await app.rpc);
  try {
    const tokenContract = tokenContractWrapper.getContract();

    // const tokenContract = await getErc20ContractWrapper(tokenAddress, await app.rpc);

    if (tokenAddress === tokens[0].address || tokenAddress === tokens[1].address) {
      const decimals = tokenAddress === tokens[0].address ? 18 : tokenAddress === tokens[1].address ? 18 : -1;
      const symbol = tokenAddress === tokens[0].address ? tokens[0].name : tokenAddress === tokens[1].address ? tokens[1].name : "";

      const [balance, allowance] = await Promise.all([tokenContract.balanceOf(reward.owner), tokenContract.allowance(reward.owner, permit2Address)]);

      return { balance, allowance, decimals, symbol };
    } else {
      console.log(`Hardcode this token in render-token-symbol.ts and save two calls: ${tokenAddress}`);

      const [balance, allowance, decimals, symbol] = await Promise.all([
        tokenContract.balanceOf(reward.owner),
        tokenContract.allowance(reward.owner, permit2Address),
        tokenContract.decimals(),
        tokenContract.symbol(),
      ]);

      return { balance, allowance, decimals, symbol };
    }
  } catch (error: unknown) {
    const badRpcUrl = tokenContractWrapper.getProviderUrl();
    const networkRpcsForCurrentNetwork = networkRpcs[app.networkId];
    const badRpcIndex = networkRpcsForCurrentNetwork.indexOf(badRpcUrl);

    if (badRpcIndex !== -1) {
      networkRpcsForCurrentNetwork.splice(badRpcIndex, 1);
    }

    await tokenContractWrapper.switchProvider(app);

    if (attemptsRemaining > 0) {
      console.warn({ attemptsRemaining });
      attemptsRemaining--;
      return await fetchSponsorWallet();
    }
  }
}

async function checkPermitClaimability(): Promise<boolean> {
  let isPermitClaimable = false;
  try {
    isPermitClaimable = await checkPermitClaimable();
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in checkPermitClaimable: ", e);
      errorToast(e, e.reason);
    }
  }
  return isPermitClaimable;
}

async function createEthersContract(signer: JsonRpcSigner) {
  let permit2Contract;
  try {
    permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in creating ethers.Contract: ", e);
      errorToast(e, e.reason);
    }
  }
  return permit2Contract;
}

async function transferFromPermit(permit2Contract: Contract) {
  const permit = app.reward;
  try {
    const tx = await permit2Contract.permitTransferFrom(permit, permit.transferDetails, permit.owner, permit.signature);
    toaster.create("info", `Transaction sent`);
    return tx;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      // Check if the error message indicates a user rejection
      if (e.code == "ACTION_REJECTED") {
        // Handle the user rejection case
        toaster.create("info", `Transaction was not sent because it was rejected by the user.`);
      } else {
        // Handle other errors
        console.error("Error in permitTransferFrom: ", e);
        errorToast(e, e.reason);
      }
    }
    return null;
  }
}

async function waitForTransaction(tx: TransactionResponse) {
  let receipt;
  try {
    receipt = await tx.wait();
    toaster.create("success", `Claim Complete.`);
    console.log(receipt.transactionHash); // @TODO: post to database
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in tx.wait: ", e);
      errorToast(e, e.reason);
    }
  }
  return receipt;
}

async function renderTx() {
  try {
    await renderTransaction();
  } catch (error: unknown) {
    if (error instanceof Error) {
      const e = error as unknown as MetaMaskError;
      console.error("Error in renderTransaction: ", e);
      errorToast(e, e.reason);
    }
  }
}

export async function claimErc20PermitHandler() {
  if (!app.signer) {
    toaster.create("error", `No signer found.`);
    return;
  }

  showLoader();

  const isPermitClaimable = await checkPermitClaimability();
  if (!isPermitClaimable) return;

  const permit2Contract = await createEthersContract(app.signer);
  if (!permit2Contract) return;

  const tx = await transferFromPermit(permit2Contract);
  if (!tx) return;

  const receipt = await waitForTransaction(tx);
  if (!receipt) return;

  claimButton.element.removeEventListener("click", claimErc20PermitHandler);

  await renderTx();
}

export async function checkPermitClaimable(): Promise<boolean> {
  if (!app.signer) {
    toaster.create("error", `No signer found.`);
    return false;
  }

  let isClaimed;
  try {
    isClaimed = await isNonceClaimed();
  } catch (error: unknown) {
    console.error("Error in isNonceClaimed: ", error);
    return false;
  }

  if (isClaimed) {
    toaster.create("error", `Your reward for this task has already been claimed or invalidated.`);
    return false;
  }

  const permit = app.reward.permit;

  if (permit.deadline.lt(Math.floor(Date.now() / 1000))) {
    toaster.create("error", `This reward has expired.`);
    return false;
  }

  let sponsor;
  try {
    sponsor = await fetchSponsorWallet();
  } catch (error: unknown) {
    console.error("Error in fetchTreasury: ", error);
    return false;
  }

  const { balance, allowance } = sponsor;
  const permitted = BigNumber.from(permit.permitted.amount);
  const isSolvent = balance.gte(permitted);
  const isAllowed = allowance.gte(permitted);

  if (!isSolvent) {
    toaster.create("error", `Not enough funds on funding wallet to collect this reward. Please let the financier know.`);
    return false;
  }
  if (!isAllowed) {
    toaster.create("error", `Not enough allowance on the funding wallet to collect this reward. Please let the financier know.`);
    return false;
  }

  let user;
  try {
    user = (await app.signer.getAddress()).toLowerCase();
  } catch (error: unknown) {
    console.error("Error in signer.getAddress: ", error);
    return false;
  }

  const beneficiary = app.reward.transferDetails.to.toLowerCase();
  if (beneficiary !== user) {
    toaster.create("warning", `This reward is not for you.`);
    return false;
  }

  return true;
}

export async function generateInvalidatePermitAdminControl() {
  if (!app.signer) {
    return;
  }

  try {
    const address = await app.signer.getAddress();
    const user = address.toLowerCase();

    if (app.reward) {
      const owner = app.reward.owner.toLowerCase();
      if (owner !== user) {
        return;
      }
    }
  } catch (error) {
    console.error("Error getting address from signer");
    console.error(error);
  }

  const controls = document.getElementById("controls") as HTMLDivElement;
  controls.appendChild(invalidateButton);

  invalidateButton.addEventListener("click", async function invalidateButtonClickHandler() {
    try {
      const isClaimed = await isNonceClaimed();
      if (isClaimed) {
        toaster.create("error", `This reward has already been claimed or invalidated.`);
        return;
      }
      if (app.signer) {
        await invalidateNonce(app.signer, app.reward.permit.nonce);
      } else {
        toaster.create("error", `No signer found.`);
        return;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        const e = error as unknown as MetaMaskError;
        console.error(e);
        errorToast(e, e.reason);
        return;
      }
    }
    toaster.create("info", "Nonce invalidation transaction sent");
  });
}

//mimics https://github.com/Uniswap/permit2/blob/a7cd186948b44f9096a35035226d7d70b9e24eaf/src/SignatureTransfer.sol#L150
export async function isNonceClaimed(): Promise<boolean> {
  const [provider, _url] = await app.rpc;
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, provider);

  const { wordPos, bitPos } = nonceBitmap(BigNumber.from(app.reward.permit.nonce));

  const bitmap = await permit2Contract.nonceBitmap(app.reward.owner, wordPos).catch((error: MetaMaskError) => {
    console.error("Error in nonceBitmap method: ", error);
    throw error;
  });

  const bit = BigNumber.from(1).shl(bitPos);
  const flipped = BigNumber.from(bitmap).xor(bit);

  return bit.and(flipped).eq(0);
}

export async function invalidateNonce(signer: JsonRpcSigner, nonce: BigNumberish): Promise<void> {
  const permit2Contract = new ethers.Contract(permit2Address, permit2Abi, signer);
  const { wordPos, bitPos } = nonceBitmap(nonce);
  // mimics https://github.com/ubiquity/pay.ubq.fi/blob/c9e7ed90718fe977fd9f348db27adf31d91d07fb/scripts/solidity/test/Permit2.t.sol#L428
  const bit = BigNumber.from(1).shl(bitPos);
  const sourceBitmap = await permit2Contract.nonceBitmap(await signer.getAddress(), wordPos.toString());
  const mask = sourceBitmap.or(bit);
  await permit2Contract.invalidateUnorderedNonces(wordPos, mask);
}

// mimics https://github.com/Uniswap/permit2/blob/db96e06278b78123970183d28f502217bef156f4/src/SignatureTransfer.sol#L142
export function nonceBitmap(nonce: BigNumberish): { wordPos: BigNumber; bitPos: number } {
  // wordPos is the first 248 bits of the nonce
  const wordPos = BigNumber.from(nonce).shr(8);
  // bitPos is the last 8 bits of the nonce
  const bitPos = BigNumber.from(nonce).and(255).toNumber();
  return { wordPos, bitPos };
}
