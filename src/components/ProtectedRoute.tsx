import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { StaffRole } from '../lib/roles';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireRole?: StaffRole[];
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requireRole,
}: Props) {
  const { user, loading, isAdmin, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // 🔐 role protection
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  if (requireRole && !requireRole.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}