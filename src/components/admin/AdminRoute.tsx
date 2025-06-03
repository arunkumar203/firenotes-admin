'use client';

import { useEffect, ReactNode, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-hot-toast';

interface AdminRouteProps {
  children: ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const toastShown = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    
    // If user is null, redirect to home (not login) for a consistent logout experience
    if (!user) {
      router.push('/');
      return;
    }
    
    const isAuthorized = user.role === 'admin' || user.role === 'root_admin';
    
    if (!isAuthorized) {
      // Only show toast if we haven't shown one yet
      if (!toastShown.current) {
        toastShown.current = 'unauthorized';
        toast.error('You do not have permission to access this page');
        router.push('/');
      }
    } else {
      // Reset the toast state if user becomes authorized
      toastShown.current = null;
    }
  }, [user, loading, router]);

  // Show loading state while checking auth
  if (loading || !user) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Don't render anything if not authorized
  if (user.role !== 'admin' && user.role !== 'root_admin') {
    return null;
  }

  return <>{children}</>;
};

export default AdminRoute;
