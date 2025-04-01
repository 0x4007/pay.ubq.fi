import { buildOrder, getQuote, OrderKind, postOrder, SigningScheme } from "@cowprotocol/cow-sdk"; // Removed signTypedDataOrder
import { Address, formatUnits, WalletClient } from "viem";
import { gnosis, mainnet } from "viem/chains"; // Import chain definitions from viem
import { COWSWAP_PARTNER_FEE_BPS, COWSWAP_PARTNER_FEE_RECIPIENT } from "../constants/config.ts"; // Added .ts
import { getTokenInfo, RewardTokenInfo, SUPPORTED_REWARD_TOKENS_BY_CHAIN } from "../constants/supported-reward-tokens.ts"; // Added .ts and RewardTokenInfo

// No SDK instantiation needed if using exported functions directly

interface CowSwapQuoteParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint; // Amount in input token's smallest unit (e.g., wei for 18 decimals)
  userAddress: Address; // Needed for quote context
  chainId: number; // Need chainId to get token decimals
}

import { QuoteAmountsAndCosts } from "@cowprotocol/cow-sdk"; // Import QuoteAmountsAndCosts type

interface CowSwapQuoteResult {
  estimatedAmountOut: bigint; // Final estimated amount after fees/slippage
  feeAmount?: bigint; // Network fee amount
  // Use the default generic type for amountsAndCosts, which should resolve to bigints based on SDK usage
  amountsAndCosts: QuoteAmountsAndCosts;
}

interface InitiateCowSwapParams extends CowSwapQuoteParams {
  // Fix typo: CowSwapParams -> CowSwapQuoteParams
  walletClient: WalletClient; // Requires a connected wallet client for signing
}

/**
 * Fetches a quote from the CowSwap API for a potential swap.
 * Does not require signing or submit an order.
 */
export async function getCowSwapQuote(params: CowSwapQuoteParams): Promise<CowSwapQuoteResult> {
  // console.log('Fetching CowSwap quote:', params);
  try {
    // Validate chainId (ensure it's provided)
    if (!params.chainId) {
      throw new Error("Chain ID is required to get CowSwap quote.");
    }

    // Fetch token decimals using the provided chainId
    const tokenInInfo = getTokenInfo(params.chainId, params.tokenIn);
    const tokenOutInfo = getTokenInfo(params.chainId, params.tokenOut);

    if (!tokenInInfo || !tokenOutInfo) {
      throw new Error(`Cannot find token info for ${params.tokenIn} or ${params.tokenOut} on chain ${params.chainId}`);
    }

    // --- Determine Partner Fee for Quote ---
    // Find UUSD address for the specific chainId provided in params
    const uusdTokenInfoQuote = (SUPPORTED_REWARD_TOKENS_BY_CHAIN[params.chainId] || []).find((token: RewardTokenInfo) => token.symbol === "UUSD"); // Added type
    const uusdAddressQuote = uusdTokenInfoQuote?.address;
    // Apply 0 fee only if on Mainnet or Gnosis AND output is UUSD (use viem chain IDs)
    const isUusdOutputOnSupportedChain =
      uusdAddressQuote && (params.chainId === mainnet.id || params.chainId === gnosis.id) && params.tokenOut.toLowerCase() === uusdAddressQuote.toLowerCase();
    const feeBpsQuote = isUusdOutputOnSupportedChain ? 0 : COWSWAP_PARTNER_FEE_BPS;
    // --- End Determine Partner Fee ---

    // Construct TradeParameters object
    const tradeParameters = {
      kind: OrderKind.SELL,
      sellToken: params.tokenIn,
      sellTokenDecimals: tokenInInfo.decimals,
      buyToken: params.tokenOut,
      buyTokenDecimals: tokenOutInfo.decimals,
      amount: params.amountIn.toString(), // Amount is the sell amount for OrderKind.SELL
      receiver: params.userAddress, // Optional: defaults to userAddress if not provided? Check SDK docs.
      // validFor: 600, // Optional: validity in seconds (e.g., 10 minutes)
      // slippageBps: 50, // Optional: 0.5% slippage tolerance
      // Set partnerFee based on conditional logic
      partnerFee: {
        bps: feeBpsQuote,
        recipient: COWSWAP_PARTNER_FEE_RECIPIENT,
      },
    };

    // Construct QuoterParameters object using dynamic chainId
    const quoterParameters = {
      chainId: params.chainId, // Use dynamic chainId
      appCode: "UbiquityPay", // Provide an app code
      account: params.userAddress,
    };

    // console.log('Calling CowSwap getQuote with:', tradeParameters, quoterParameters);
    const quoteResponse = await getQuote(tradeParameters, quoterParameters);
    // console.log('CowSwap Quote Response:', quoteResponse);

    // Parse the response from result.amountsAndCosts
    const amountsAndCosts = quoteResponse.result?.amountsAndCosts;
    if (!amountsAndCosts || !amountsAndCosts.afterPartnerFees || !amountsAndCosts.afterPartnerFees.buyAmount) {
      throw new Error("Invalid quote response structure received from CowSwap API. Expected result.amountsAndCosts.afterPartnerFees.buyAmount.");
    }

    // Use afterPartnerFees.buyAmount for the primary estimated output
    const estimatedAmountOut = BigInt(amountsAndCosts.afterPartnerFees.buyAmount);
    // Use network fee in sell currency as the representative fee amount
    const feeAmount = amountsAndCosts.costs?.networkFee?.amountInSellCurrency ? BigInt(amountsAndCosts.costs.networkFee.amountInSellCurrency) : undefined;

    // console.log(`Actual Quote: In: ${params.amountIn}, Out (afterPartnerFees): ${estimatedAmountOut}, Fee (network): ${feeAmount ?? 'N/A'}`);
    // console.log('Full amountsAndCosts:', amountsAndCosts); // Log the full object

    // Return the final amount, fee, and the full breakdown object
    return {
      estimatedAmountOut,
      feeAmount,
      amountsAndCosts: amountsAndCosts, // Return the object directly without casting
    };
  } catch (error) {
    console.error("Error fetching CowSwap quote:", error);
    // Cannot access tokenInfo here, use params directly for error message
    throw new Error(
      `Failed to get CowSwap quote for token ${params.tokenIn} -> ${params.tokenOut}. Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Initiates a CowSwap order by fetching quote/order params,
 * requesting user signature, and submitting to the API.
 */
export async function initiateCowSwap(params: InitiateCowSwapParams): Promise<{ orderUid: string }> {
  // console.log('Initiating CowSwap order (placeholder):', params);
  if (!params.walletClient.account) {
    throw new Error("Wallet client account is not available for signing.");
  }
  // Add chainId check if needed by SDK methods below
  if (!params.chainId) {
    throw new Error("Chain ID is required to initiate swap.");
  }
  const signerAddress = params.walletClient.account.address; // Get signer address

  try {
    // No SDK instantiation needed if using top-level functions

    // --- Determine Partner Fee ---
    const uusdTokenInfo = (SUPPORTED_REWARD_TOKENS_BY_CHAIN[params.chainId] || []).find((token: RewardTokenInfo) => token.symbol === "UUSD"); // Added type
    const uusdAddress = uusdTokenInfo?.address;
    const isUusdOutputOnSupportedChainOrder =
      uusdAddress && (params.chainId === mainnet.id || params.chainId === gnosis.id) && params.tokenOut.toLowerCase() === uusdAddress.toLowerCase();
    const feeBps = isUusdOutputOnSupportedChainOrder ? 0 : COWSWAP_PARTNER_FEE_BPS;
    // --- End Determine Partner Fee ---

    // 1. Create the Order object
    // Note: `createOrder` requires amount *before* fees. We have amountIn, which is the sell amount.
    // The SDK handles calculating buyAmount based on quote/limit price internally if not provided.
    // We'll use a SELL order, specifying the exact sell amount.
    const orderCreationPayload = {
      sellToken: params.tokenIn,
      buyToken: params.tokenOut,
      sellAmount: params.amountIn.toString(), // Exact amount to sell
      kind: OrderKind.SELL,
      receiver: signerAddress, // Swap proceeds go back to the user
      partiallyFillable: false, // Usually false for simple swaps
      validTo: Math.floor(Date.now() / 1000) + 1800, // Valid for 30 minutes
      appData: JSON.stringify({ appCode: "UbiquityPay" }), // Identify the app
      partnerFee: {
        bps: feeBps,
        recipient: COWSWAP_PARTNER_FEE_RECIPIENT,
      },
      // buyAmount: undefined, // Let CowSwap determine the best possible buy amount
      // from: signerAddress, // 'from' is implicitly the signer
    };

    // 1. Build the Order structure using the top-level function
    // Pass necessary context like chainId and account address
    const order = await buildOrder(orderCreationPayload, {
      chainId: params.chainId,
      account: signerAddress,
    });

    if (!order) {
      throw new Error("Failed to build CowSwap order parameters.");
    }

    // 2. Sign the Order using viem's signTypedData
    // The 'order' object from buildOrder should contain the domain, types, and message for EIP-712 signing
    if (!order.typedData) {
      throw new Error("Failed to get typed data from buildOrder response for signing.");
    }
    const signature = await params.walletClient.signTypedData({
      account: params.walletClient.account, // Ensure account is passed
      domain: order.typedData.domain,
      types: order.typedData.types,
      primaryType: "Order", // Usually "Order" for CowSwap EIP-712
      message: order.typedData.message,
    });


    if (!signature) {
      throw new Error("Failed to sign CowSwap order using walletClient.");
    }

    // 3. Submit the Signed Order using the top-level postOrder function
    // Pass the order creation payload, signature, and context
    const orderUid = await postOrder({
      order: order.creation, // Pass the order creation payload
      signature: signature,
      signingScheme: SigningScheme.EIP712, // Specify the scheme used
      owner: signerAddress, // Often required for submission endpoint
    }, { chainId: params.chainId });


    if (!orderUid) {
      throw new Error("Failed to submit CowSwap order or retrieve Order UID.");
    }

    console.log('CowSwap Order Submitted. UID:', orderUid); // Keep console log for debugging
    return { orderUid };
  } catch (error) {
    console.error("Error initiating CowSwap order:", error);
    // Provide a more specific error message if possible
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    // Use token info for better error message formatting
    const tokenInInfo = getTokenInfo(params.chainId, params.tokenIn);
    const tokenOutInfo = getTokenInfo(params.chainId, params.tokenOut);
    const amountStr = tokenInInfo ? formatUnits(params.amountIn, tokenInInfo.decimals) : params.amountIn.toString();
    const inSymbol = tokenInInfo?.symbol || params.tokenIn;
    const outSymbol = tokenOutInfo?.symbol || params.tokenOut;

    throw new Error(`Failed to initiate CowSwap for ${amountStr} ${inSymbol} -> ${outSymbol}: ${message}`);
  }
}
