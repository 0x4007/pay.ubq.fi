import { JsonRpcProvider } from "@ethersproject/providers";
import { MaxUint256 } from "@uniswap/permit2-sdk";
import { BigNumberish, utils } from "ethers";
import { app } from "../app-state";
import { GetErc20ContractWrapper } from "../web3/get-erc20-contract";

export const tokens = [
  {
    name: "WXDAI",
    address: "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d",
  },
  {
    name: "DAI",
    address: "0x6b175474e89094c44da98b954eedeac495271d0f",
  },
];

export async function renderTokenSymbol({
  requestedAmountElement,
  tokenAddress,
  ownerAddress,
  amount,
  explorerUrl,
  provider,
}: {
  requestedAmountElement: Element;
  tokenAddress: string;
  ownerAddress: string;
  amount: BigNumberish;
  explorerUrl: string;
  provider: JsonRpcProvider;
}): Promise<void> {
  let symbol = tokenAddress === tokens[0].address ? tokens[0].name : tokenAddress === tokens[1].address ? tokens[1].name : false;
  let decimals = tokenAddress === tokens[0].address ? 18 : tokenAddress === tokens[1].address ? 18 : MaxUint256;

  if (!symbol || decimals === MaxUint256) {
    const contract = new GetErc20ContractWrapper(tokenAddress, provider).getContract();
    symbol = await contract.symbol();
    decimals = await contract.decimals();
  }

  app.table.setAttribute("data-contract-loaded", "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}?a=${ownerAddress}">${utils.formatUnits(
    amount,
    decimals
  )} ${symbol}</a>`;
}

export async function renderNftSymbol({
  requestedAmountElement,
  tokenAddress,
  explorerUrl,
  provider,
}: {
  requestedAmountElement: Element;
  tokenAddress: string;
  explorerUrl: string;
  provider: JsonRpcProvider;
}): Promise<void> {
  const contract = new GetErc20ContractWrapper(tokenAddress, provider).getContract();
  const symbol = await contract.symbol();
  app.table.setAttribute("data-contract-loaded", "true");
  requestedAmountElement.innerHTML = `<a target="_blank" rel="noopener noreferrer" href="${explorerUrl}/token/${tokenAddress}">1 ${symbol}</a>`;
}
