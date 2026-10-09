import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: Props) {
  const { user, loading, isAdmin } = useAuth();

  // لودینگ سبک — تمام‌صفحه نیست تا Layout/منو از هم نپاشد
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderColor: 'var(--border-strong)',
            borderTopColor: 'var(--accent)',
          }}
        />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
