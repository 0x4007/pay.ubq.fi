import { app } from "../app-state";
import { networkExplorers } from "../constants";
import { claimButton, hideLoader } from "../toaster";
import { claimErc20PermitHandler, fetchSponsorWallet, generateInvalidatePermitAdminControl } from "../web3/erc20-permit";
import { claimErc721PermitHandler } from "../web3/erc721-permit";
import { insertErc20PermitTableData, insertErc721PermitTableData } from "./insert-table-data";
import { renderEnsName } from "./render-ens-name";
import { renderNftSymbol, renderTokenSymbol } from "./render-token-symbol";
import { setPagination } from "./set-pagination";

type Success = boolean;

export async function renderTransaction({ nextPermit }: { nextPermit: boolean } = { nextPermit: false }): Promise<Success> {
  const table = document.getElementsByTagName(`table`)[0];

  if (nextPermit) {
    app.nextReward();
    if (!app.claims || app.claims?.length <= 1) {
      // already hidden
    } else {
      setPagination(document.getElementById("nextTx"), document.getElementById("previousTx"));

      const rewardsCount = document.getElementById("rewardsCount") as Element;
      rewardsCount.innerHTML = `${app.permitIndex + 1}/${app.claims.length} reward`;
      app.state = "claim error";
    }
  }

  if (!app.reward) {
    hideLoader();
    return false;
  }

  if (app.reward.type === "erc20-permit") {
    const sponsorWallet = await fetchSponsorWallet();

    // insert tx data into table
    const requestedAmountElement = insertErc20PermitTableData(sponsorWallet);

    renderTokenSymbol({
      tokenAddress: app.reward.permit.permitted.token,
      ownerAddress: app.reward.owner,
      amount: app.reward.transferDetails.requestedAmount,
      explorerUrl: networkExplorers[app.reward.networkId],
      requestedAmountElement,
      provider: await app.rpc,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.reward.transferDetails.to }).catch(console.error);

    if (app.signer) {
      if ((await app.signer.getAddress()).toLowerCase() === app.reward.owner.toLowerCase()) {
        generateInvalidatePermitAdminControl();
      }
    }

    claimButton.element.addEventListener("click", claimErc20PermitHandler);
    app.state = "claim rendered";
  } else if (app.reward.type === "erc721-permit") {
    const requestedAmountElement = insertErc721PermitTableData(app.reward);
    app.state = "claim rendered";

    renderNftSymbol({
      tokenAddress: app.reward.nftAddress,
      explorerUrl: networkExplorers[app.reward.networkId],
      requestedAmountElement,
      provider: await app.rpc,
    }).catch(console.error);

    const toElement = document.getElementById(`rewardRecipient`) as Element;
    renderEnsName({ element: toElement, address: app.reward.request.beneficiary }).catch(console.error);

    claimButton.element.addEventListener("click", async () => {
      try {
        await claimErc721PermitHandler();
      } catch (error) {
        console.error(error);
      }
    });
  }

  return true;
}
