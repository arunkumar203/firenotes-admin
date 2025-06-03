'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export function useRedirectAfterLogin(defaultPath = '/notes') {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      // Get the redirect URL from session storage
      const redirectPath = sessionStorage.getItem('redirectAfterLogin') || defaultPath;
      
      // Clear the stored redirect path
      if (sessionStorage.getItem('redirectAfterLogin')) {
        sessionStorage.removeItem('redirectAfterLogin');
      }
      
      // Only redirect if we're not already on the target page
      if (typeof window !== 'undefined' && window.location.pathname !== redirectPath) {
        router.push(redirectPath);
      }
    }
  }, [user, defaultPath, router]);

  return null;
}
