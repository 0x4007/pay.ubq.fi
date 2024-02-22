import { app } from "../app-state";
import { claimRewardsPagination } from "./claim-rewards-pagination";
import { renderTransaction } from "./render-transaction";

export async function readClaimDataFromUrl() {
  displayRewardDetails();
  displayRewardPagination();
  renderTransaction({ nextPermit: true }).catch(console.error);
}

function displayRewardDetails() {
  let isDetailsVisible = false;
  app.state = isDetailsVisible ? "details visible" : "details not visible";
  const additionalDetails = document.getElementById(`additionalDetails`) as HTMLElement;
  additionalDetails.addEventListener("click", () => {
    isDetailsVisible = !isDetailsVisible;
    app.state = isDetailsVisible ? "details visible" : "details not visible";
  });
}

function displayRewardPagination() {
  const rewardsCount = document.getElementById("rewardsCount");
  if (rewardsCount) {
    if (!app.claims || app.claims.length <= 1) {
      // already hidden
    } else {
      claimRewardsPagination(rewardsCount);
    }
  }
}
