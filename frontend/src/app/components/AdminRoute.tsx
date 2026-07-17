import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '../hooks/useMe';

export function AdminRoute() {
  const { isAdmin, loading } = useMe();
  if (loading) return null;
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}
