import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import type { UserRole } from '@/types';

interface RoleBasedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export function RoleBasedRoute({ children, allowedRoles }: RoleBasedRouteProps) {
  const { isAuthenticated, isLoading, hasRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasRole(allowedRoles)) {
    // Redirect unauthorized users to overview
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
