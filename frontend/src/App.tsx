import { type ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { useAccount } from "wagmi";
import { DashboardPage } from "./components/dashboard-page.tsx";
import { LoginPage } from "./components/login-page.tsx";

export default function App(): ReactElement {
  const { isConnected } = useAccount();
  return (
    <Routes>
      <Route path="/" element={isConnected ? <DashboardPage /> : <LoginPage />} />
    </Routes>
  );
}
