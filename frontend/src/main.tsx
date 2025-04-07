/// <reference lib="dom" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; // Import QueryClient things
import { StrictMode } from 'react'; // Re-add StrictMode import, Add React import
import { createRoot } from 'react-dom/client';
// Removed BrowserRouter import
import { injected } from "@wagmi/connectors";
import { type Chain } from "viem/chains"; // Import Chain type
import { WagmiProvider, createConfig, http } from "wagmi";
import {
  arbitrum, // 42220
  avalanche, // 324
  base, // 43114
  blast, // 10
  bsc, // 42161
  celo, // 56
  gnosis,
  mainnet, // 1
  optimism, // 100
  polygon, // 137
  zkSync, // 81457
  zora, // 7777777
} from "wagmi/chains";
// Removed Permit2RpcManager import as it's now used only in the worker
import App from "./App.tsx";
// import './ubiquity-styles.css'; // Import ubiquity styles - REMOVED, will link in index.html
// import './grid-styles.css'; // Import grid styles (once) - REMOVED, will link in index.html
import { WorkerProvider } from './context/worker-context.tsx'; // Import WorkerProvider
import { grid } from './the-grid.ts'; // Added .ts extension

// Removed Permit2RpcManager instantiation and export

// Configure wagmi
const supportedChains = [
  mainnet,
  optimism,
  bsc,
  gnosis,
  polygon,
  zkSync,
  base,
  arbitrum,
  celo,
  avalanche,
  blast,
  zora,
];

// Dynamically create transports for all supported chains
const transports = supportedChains.reduce((acc, chain) => {
  acc[chain.id] = http(`https://rpc.ubq.fi/${chain.id}`);
  return acc;
}, {} as Record<number, ReturnType<typeof http>>);


export const config = createConfig({ // Export config
  chains: supportedChains as unknown as [Chain, ...Chain[]], // Assert via unknown
  connectors: [
    injected(), // Use injected connector (removed shimDisconnect)
    // Add WalletConnect, Coinbase Wallet etc. here if needed later
  ],
  transports: transports,
});

// Create QueryClient instance
const queryClient = new QueryClient();

const rootElement = document.getElementById('root');
const gridElement = document.getElementById('grid'); // Get the grid container

if (!rootElement) {
  throw new Error("Could not find root element to mount React app");
}
if (!gridElement) {
   // Warn if grid element is missing
}

createRoot(rootElement).render(
  <StrictMode> {/* Re-enabled StrictMode */}
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WorkerProvider> {/* Wrap App with WorkerProvider */}
          {/* Removed AuthProvider wrapper */}
          {/* Removed BrowserRouter wrapper */}
          <App />
        </WorkerProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);

// Initialize the grid animation, targeting the #grid div if it exists
if (gridElement) {
  // Call grid with the element and the callback
  grid(gridElement, () => document.body.classList.add("grid-loaded"));
}

// Removed commented out duplicate import and call
