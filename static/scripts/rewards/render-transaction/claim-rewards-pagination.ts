import { app } from "../app-state";
import { claimButton } from "../toaster";
import { renderTransaction } from "./render-transaction";
import { setPagination } from "./set-pagination";
import { removeAllEventListeners } from "./utils";

export function claimRewardsPagination(rewardsCount: HTMLElement) {
  rewardsCount.innerHTML = `${app.permitIndex + 1}/${app.claims.length} reward`;

  const nextTxButton = document.getElementById("nextTx");
  if (nextTxButton) {
    nextTxButton.addEventListener("click", () => {
      claimButton.element = removeAllEventListeners(claimButton.element) as HTMLButtonElement;
      app.nextReward();
      rewardsCount.innerHTML = `${app.permitIndex + 1}/${app.claims.length} reward`;
      app.table.setAttribute(`data-claim`, "error");
      renderTransaction({ nextPermit: true }).catch(console.error);
    });
  }

  const prevTxButton = document.getElementById("previousTx");
  if (prevTxButton) {
    prevTxButton.addEventListener("click", () => {
      claimButton.element = removeAllEventListeners(claimButton.element) as HTMLButtonElement;
      app.previousReward();
      rewardsCount.innerHTML = `${app.permitIndex + 1}/${app.claims.length} reward`;
      app.table.setAttribute(`data-claim`, "error");
      renderTransaction({ nextPermit: true }).catch(console.error);
    });
  }

  setPagination(nextTxButton, prevTxButton);
}
