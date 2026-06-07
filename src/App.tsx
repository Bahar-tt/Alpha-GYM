import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Renewals from './pages/Renewals';
import Messaging from './pages/Messaging';
import SmsLogs from './pages/SmsLogs';
import Broadcast from './pages/Broadcast';
import CoachPortal from './pages/CoachPortal';
import UsersPage from './pages/Users';

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"  element={<Dashboard />} />
            <Route path="members"    element={<Members />} />
            <Route path="renewals"   element={<Renewals />} />
            <Route path="messaging"  element={<Messaging />} />

            {/* Admin-only routes */}
            <Route path="sms-logs"  element={<ProtectedRoute requireAdmin><SmsLogs /></ProtectedRoute>} />
            <Route path="broadcast" element={<ProtectedRoute requireAdmin><Broadcast /></ProtectedRoute>} />
            <Route path="coach"     element={<ProtectedRoute requireAdmin><CoachPortal /></ProtectedRoute>} />
            <Route path="users"     element={<ProtectedRoute requireAdmin><UsersPage /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;