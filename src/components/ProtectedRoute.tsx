'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import toast from 'react-hot-toast';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  redirectTo?: string;
  requireEmailVerified?: boolean;
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  redirectTo = '/login',
  requireEmailVerified = false,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    const isAuthPage = ['/login', '/signup', '/'].includes(pathname);
    const isLoggingOut = pathname === '/' && !user;

    // If user is not authenticated
    if (!user) {
      // Don't show any toasts or redirects if we're on an auth page or logging out
      if (isAuthPage || isLoggingOut) {
        return;
      }

      // Show toast and redirect to login for protected pages
      toast.error('Please sign in to access this page', {
        id: 'auth-required',
        duration: 3000,
        position: 'top-center',
      });
      
      // Store the current URL for redirect after login
      const redirectUrl = pathname === '/' ? '/login' : pathname;
      sessionStorage.setItem('redirectAfterLogin', redirectUrl);
      
      // Redirect to login
      router.push(redirectTo);
      
      return;
    }

    // Check if email needs to be verified
    if (requireEmailVerified && !user.emailVerified) {
      router.push('/verify-email');
      return;
    }

    // Check admin status if required
    if (requireAdmin && user.email !== 'admin@example.com') {
      router.push('/unauthorized');
      return;
    }
  }, [user, loading, requireAdmin, requireEmailVerified, redirectTo, router, pathname]);

  // Show loading state while checking auth status
  if (loading || !user || (requireEmailVerified && !user.emailVerified)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-gray-600">Checking authentication...</p>
      </div>
    );
  }

  // Check admin status if required
  if (requireAdmin && user.email !== 'admin@example.com') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
          <p className="mt-2 text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
