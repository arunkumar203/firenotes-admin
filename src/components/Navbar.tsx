'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { FiLogOut, FiUser, FiMenu, FiLoader, FiSearch, FiX } from 'react-icons/fi';
import { UserRole } from '@/context/AuthContext';

// Debounce utility function
const debounce = <F extends (...args: any[]) => any>(func: F, wait: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
    }
  };

  return debounced;
};

interface User {
  uid: string;
  email: string | null;
  role?: UserRole;
  photoURL?: string | null;
  displayName?: string | null;
}

// This is a client component that handles the navigation bar
// It shows different navigation items based on the user's authentication status and role

// Profile photo component that shows user's photo or their initial
function ProfilePhoto({ user, isOpen, onClick }: { user: any, isOpen: boolean, onClick: () => void }) {
  // Get the first letter of the email or default to 'U'
  const userInitial = user?.email?.[0]?.toUpperCase() || 'U';
  
  // Check if we have a valid photo URL
  const hasPhoto = user?.photoURL && user.photoURL.trim() !== '';
  
  return (
    <button
      onClick={onClick}
      className="text-gray-500 hover:text-gray-700 flex-shrink-0 focus:outline-none"
      title={user?.email || 'User Profile'}
    >
      {hasPhoto ? (
        <div className="h-8 w-8 rounded-full overflow-hidden">
          <img
            src={user.photoURL}
            alt={user.displayName || 'Profile'}
            className="h-full w-full object-cover"
            onError={(e) => {
              // If image fails to load, show the initial instead
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                const fallback = document.createElement('div');
                fallback.className = 'h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium';
                fallback.textContent = userInitial;
                parent.appendChild(fallback);
              }
            }}
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
          {userInitial}
        </div>
      )}
    </button>
  );
}

export default function Navbar() {
  // Hooks must be called at the top level
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Update URL when search query changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (searchQuery) {
        params.set('q', searchQuery);
      } else {
        params.delete('q');
      }
      router.replace(`?${params.toString()}`);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchParams, router]);

  // Handle search input changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Handle clicking outside the search container
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Close profile dropdown if clicked outside
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }

      // Close search if clicked outside and search is empty
      if (searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node) &&
        !searchQuery) {
        setIsSearchFocused(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchQuery]);

  // Handle clearing search
  const handleClearSearch = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  // Handle search form submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchInputRef.current?.blur();
  };

  // Don't show navbar on auth pages
  if (!pathname || pathname === '/' || pathname === '/signup' || pathname === '/login') {
    return null;
  }

  // Show loading state while AuthContext is initializing
  if (authLoading) {
    return (
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <FiLoader className="animate-spin h-5 w-5 text-gray-500" />
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Show loading state while auth state is being checked
  if (authLoading) {
    return (
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <FiLoader className="animate-spin h-5 w-5 text-gray-500" />
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Don't show navbar if user is not authenticated
  if (!user) {
    return null;
  }

  // Prepare user data
  const userRole = user?.role || 'user';

  const handleLogout = async () => {
    // Dismiss any existing toasts first
    toast.dismiss();

    // Show loading toast with a specific ID
    const toastId = 'logout-toast';
    toast.loading('Logging out...', { id: toastId });

    try {
      // Perform the actual logout
      await logout();

      // Update the existing toast to show success
      toast.success('Successfully logged out', {
        id: toastId,
        duration: 2000
      });

    } catch (error) {
      console.error('Logout error:', error);
      // Update the existing toast to show error
      toast.error('Failed to log out', {
        id: toastId,
        duration: 3000
      });
    }
  };

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center w-full">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-gray-900">Notes</h1>
            </div>
            <div className="ml-12 flex-1 max-w-2xl">
              <div className="hidden md:block">
                <form onSubmit={handleSearchSubmit}>
                  <div
                    ref={searchContainerRef}
                    className={`relative w-full max-w-xl mx-4 ${isSearchFocused ? 'ring-2 ring-blue-500' : ''} rounded-lg bg-white`}
                  >
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FiSearch className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search notes..."
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onFocus={() => setIsSearchFocused(true)}
                      onBlur={() => {
                        if (!searchQuery) {
                          setIsSearchFocused(false);
                        }
                      }}
                      className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg leading-5 bg-transparent placeholder-gray-500 focus:outline-none focus:ring-0 focus:border-transparent sm:text-sm"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      >
                        <FiX className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center space-x-6">
            <Link
              href="/notes"
              className={`${pathname === '/notes'
                ? 'border-blue-500 text-gray-900'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
            >
              My Notes
            </Link>

            {/* Admin Dashboard Link - Only show for admins */}
            {(user.role === 'admin' || user.role === 'root_admin') && (
              <Link
                href="/admin"
                className={`${pathname === '/admin'
                  ? 'border-blue-500 text-gray-900'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
              >
                <FiUser className="mr-1 h-5 w-5" />
                Admin Dashboard
              </Link>
            )}

            {/* User email and actions */}
            <div className="flex items-center space-x-4 ml-4">
              <div className="text-sm text-gray-700">
                {user.email}
              </div>

              <div className="relative" ref={profileRef}>
                <ProfilePhoto
                  user={user}
                  isOpen={isProfileOpen}
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                />

                {/* Profile Dropdown */}
                {isProfileOpen && (
                  <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
                    <div className="py-1" role="menu" aria-orientation="vertical">
                      <Link
                        href="/profile"
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        Your Profile
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-red-600 hidden sm:block"
                title="Sign out"
              >
                <FiLogOut className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="sm:hidden flex items-center">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-controls="mobile-menu"
              aria-expanded="false"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <span className="sr-only">Open main menu</span>
              <FiMenu className="block h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isProfileOpen && (
        <div className="sm:hidden" id="mobile-menu">
          <div className="pt-2 pb-3 space-y-1">
            <Link
              href="/notes"
              className={`${pathname === '/notes'
                ? 'bg-blue-50 border-blue-500 text-blue-700'
                : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700'
                } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
              onClick={() => setIsProfileOpen(false)}
            >
              My Notes
            </Link>
            {(user.role === 'admin' || user.role === 'root_admin') && (
              <Link
                href="/admin"
                className={`${pathname === '/admin'
                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                  : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700'
                  } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
                onClick={() => setIsProfileOpen(false)}
              >
                Admin Dashboard
              </Link>
            )}
          </div>
          <div className="pt-4 pb-3 border-t border-gray-200">
            <div className="flex items-center px-4">
              <div className="text-sm font-medium text-gray-700">
                {user.email}
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <Link
                href="/profile"
                className="block px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                onClick={() => setIsProfileOpen(false)}
              >
                Your Profile
              </Link>
              <button
                onClick={handleLogout}
                className="block w-full text-left px-4 py-2 text-base font-medium text-red-600 hover:bg-gray-100"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
