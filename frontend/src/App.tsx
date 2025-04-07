import React from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { useAccount } from "wagmi";

// Import page components
import { LeaderboardRoute } from "./components/leaderboard-route.tsx"; // Import LeaderboardRoute
import { LoginPage } from "./components/login-page.tsx";
import { WorkerProvider } from "./context/worker-context.tsx"; // Import WorkerProvider

// A simple layout component for authenticated views
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>
        <Link to="/" style={{ marginRight: '15px' }}>Dashboard</Link>
        <Link to="/leaderboard">Leaderboard</Link>
        {/* Add logout button or other nav items here if needed */}
      </nav>
      <main>{children}</main>
    </div>
  );
}

// ProtectedRoute component to handle authentication checks
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  if (!isConnected) {
    // Redirect them to the /login page, but save the current location they were
    // trying to go to. This is optional, good UX pattern.
    return <Navigate to="/login" replace />;
  }
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}

function App() {
  // useAccount is now used within ProtectedRoute
  return (
    <WorkerProvider> {/* Wrap the router with WorkerProvider */}
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={<Navigate to="/leaderboard" replace />}
          />
          <Route
            path="/leaderboard"
            element={
              <ProtectedRoute> {/* Assume leaderboard also needs protection */}
                <LeaderboardRoute /> {/* Render the actual leaderboard */}
              </ProtectedRoute>
            }
          />
          {/* Optional: Add a catch-all route or redirect for unknown paths */}
           <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </WorkerProvider>
  );
}

export default App;
