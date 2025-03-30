import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected } from '@wagmi/connectors';
import { createBrowserHistory } from 'history';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Router } from 'react-router-dom';
import { createConfig, http, WagmiProvider, type Config } from 'wagmi';
import { gnosis, mainnet, optimism } from 'wagmi/chains';
import App from './App.tsx';
import { grid } from './the-grid.ts';

// Configure wagmi
const config = createConfig({
  chains: [mainnet, gnosis, optimism],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [gnosis.id]: http(),
    [optimism.id]: http(),
  },
}) satisfies Config;

// Create QueryClient instance
const queryClient = new QueryClient();

// Create browser history
const history = createBrowserHistory();

// Mount React app
const rootElement = document.getElementById('root');
const gridElement = document.getElementById('grid');

if (!rootElement) {
  throw new Error("Could not find root element to mount React app");
}
if (!gridElement) {
  console.warn("Could not find grid element for background animation");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Router location={history.location} navigator={history}>
          <App />
        </Router>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);

// Initialize the grid animation if element exists
if (gridElement) {
  grid(gridElement, () => document.body.classList.add("grid-loaded"));
}
