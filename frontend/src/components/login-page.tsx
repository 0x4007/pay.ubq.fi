import { type Connector } from "@wagmi/core";
import React, { type ReactElement } from "react";
import { useConnect } from "wagmi";
import logoSvgContent from "../assets/ubiquity-os-logo.svg?raw";
import { ICONS } from "./iconography.tsx";

interface EthereumProvider {
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isUnlocked?: boolean;
  enable?: () => Promise<void>;
  request?: (args: { method: string; params?: Array<unknown> }) => Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function LoginPage(): ReactElement {
  const { connect, connectors, error, isPending } = useConnect();

  const LogoSpan: React.FC = () => (
    <span
      id="header-logo-wrapper"
      dangerouslySetInnerHTML={{ __html: logoSvgContent }}
    />
  );

  return (
    <section id="header">
      <div id="logo-wrapper">
        <h1>
          <LogoSpan />
          <span>Ubiquity OS Rewards</span>
        </h1>
      </div>
      {(() => {
        const injectedConnector = connectors.find((c: Connector) => c.id === "injected");

        if (!injectedConnector) {
          return <div>Browser wallet connector not found. Please install MetaMask or a similar wallet.</div>;
        }

        const isReady = typeof window !== "undefined" && !!window.ethereum;

        return (
          <button
            className="button-with-icon"
            disabled={!isReady || isPending}
            onClick={() => connect({ connector: injectedConnector })}
          >
            {ICONS.CONNECT}
            <span>
              {isPending ? "Connecting..." : "Connect Wallet"}
              {!isReady && !isPending && " (unsupported)"}
            </span>
          </button>
        );
      })()}
      {error && <div>{error.message}</div>}
    </section>
  );
}
