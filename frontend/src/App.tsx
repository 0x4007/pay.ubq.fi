import { useAccount } from "wagmi";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";

// Import page components
import { LoginPage } from "./components/login-page";
import { DashboardPage } from "./components/dashboard-page";
import { DeveloperLeaderboard } from "./components/developer-leaderboard"; // Import the new component

// A simple layout component for authenticated views
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav >
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
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <DeveloperLeaderboard />
            </ProtectedRoute>
          }
        />
        {/* Optional: Add a catch-all route or redirect for unknown paths */}
         <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
