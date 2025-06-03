'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/context/AuthContext';
import { toast } from 'react-hot-toast';
import React, { ReactElement } from 'react';

interface UserProfile {
  uid: string;
  email?: string;
  role: UserRole; // Make role required
  displayName?: string;
  photoURL?: string | null;
  disabled?: boolean;
  lastLogin?: number | null;
  previousLogin?: number | null;
}

const AdminDashboard = (): ReactElement => {
  const { user, getAllUsers, updateUserRole, deleteUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    
    const loadUsers = async (): Promise<void> => {
      try {
        setLoading(true);
        const userList = await getAllUsers() as Array<Record<string, any>>;
        
        if (!isMounted) return;

        // Transform and validate user data
        const validUsers = userList
          .map(user => {
            const userProfile: UserProfile = {
              uid: String(user.uid || ''),
              email: user.email as string | undefined,
              role: (user.role || 'user') as UserRole,
              displayName: user.displayName as string | undefined,
              photoURL: user.photoURL as string | null | undefined,
              disabled: user.disabled as boolean | undefined,
              lastLogin: user.lastLogin ? Number(user.lastLogin) : null,
              previousLogin: user.previousLogin ? Number(user.previousLogin) : null
            };
            return userProfile;
          })
          .filter(user => user.uid)
          .sort((a, b) => {
            const roleOrder: Record<UserRole, number> = {
              root_admin: 0,
              admin: 1,
              user: 2
            };

            const roleA = roleOrder[a.role] ?? 2;
            const roleB = roleOrder[b.role] ?? 2;

            if (roleA !== roleB) {
              return roleA - roleB;
            }
            return (a.email || '').localeCompare(b.email || '');
          });

        setUsers(validUsers);
        setError('');
      } catch (err) {
        console.error('Error loading users:', err);
        if (isMounted) {
          setError('Failed to load users. Please try again.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadUsers();
    
    return () => {
      isMounted = false;
    };
  }, [getAllUsers]);

  const sortUsers = (users: UserProfile[]): UserProfile[] => {
    return [...users].sort((a, b) => {
      const roleOrder: Record<UserRole, number> = {
        root_admin: 0,
        admin: 1,
        user: 2
      };

      const roleA = roleOrder[a.role] ?? 2;
      const roleB = roleOrder[b.role] ?? 2;

      if (roleA !== roleB) {
        return roleA - roleB;
      }
      return (a.email || '').localeCompare(b.email || '');
    });
  };

  const handleRoleChange = async (userId: string, newRole: UserRole): Promise<void> => {
    if (!user) return;
    
    try {
      // Prevent changing your own role
      if (userId === user.uid) {
        toast.error('You cannot change your own role');
        return;
      }

      await updateUserRole(userId, newRole);
      
      // Update the local state to reflect the change and re-sort
      setUsers(prevUsers => {
        const updatedUsers = prevUsers.map(u => 
          u.uid === userId ? { ...u, role: newRole } : u
        );
        return sortUsers(updatedUsers);
      });
      
      // Success toast is handled in updateUserRole
    } catch (err) {
      const error = err as Error;
      console.error('Failed to update role:', error);
      toast.error(error.message || 'Failed to update user role');
    }
  };

  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});

  const handleDeleteUser = async (userId: string, userEmail: string = 'this user'): Promise<void> => {
    if (!user || !window.confirm(`Are you sure you want to delete user ${userEmail || ''}?`)) {
      return;
    }

    setIsDeleting(prev => ({ ...prev, [userId]: true }));

    try {
      // Prevent deleting yourself
      if (userId === user.uid) {
        toast.error('You cannot delete your own account');
        return;
      }

      // Prevent deleting admin users
      const userToDelete = users.find(u => u.uid === userId);
      if (userToDelete?.role === 'admin' || userToDelete?.role === 'root_admin') {
        toast.error('Cannot delete admin users');
        return;
      }

      await deleteUser(userId);

      // Update local state with proper type safety
      setUsers((prevUsers: UserProfile[]) =>
        prevUsers.filter((u: UserProfile) => u.uid !== userId)
      );

      // Don't show success toast here - it's handled in the deleteUser function
    } catch (err) {
      const error = err as Error;
      console.error('Failed to delete user:', error);
      // Don't show error toast here - it's handled in the deleteUser function
    } finally {
      setIsDeleting(prev => ({ ...prev, [userId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-4 text-red-600">
        You must be logged in to access this page
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            User Management
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Manage user roles and permissions
          </p>
        </div>

        <div className="border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Previous Login
                </th>
                {user?.role === 'root_admin' && (
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((userItem: UserProfile) => {
                // Skip rendering if userItem is not valid
                if (!userItem || !userItem.uid) return null;

                return (
                  <tr key={userItem.uid}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {userItem.email || 'No email'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user?.role === 'root_admin' ? (
                        <div className="relative">
                          <select
                            value={userItem.role || 'user'}
                            onChange={(e) => handleRoleChange(userItem.uid, e.target.value as UserRole)}
                            disabled={userItem.uid === user?.uid || userItem.role === 'root_admin'}
                            className={`block w-full pl-3 pr-10 py-2 text-sm border ${(userItem.uid === user?.uid || userItem.role === 'root_admin') 
                              ? 'bg-gray-100 text-gray-500 border-gray-200' 
                              : 'bg-white border-gray-300 hover:border-gray-400'} 
                              rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 appearance-none`}
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                            {userItem.role === 'root_admin' && (
                              <option value="root_admin">Root Admin</option>
                            )}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      ) : (
                        <span className="capitalize">{userItem.role || 'user'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {userItem.lastLogin ? (
                        <div className="group relative">
                          <div className="flex flex-col">
                            <span>{new Date(Number(userItem.lastLogin)).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })}</span>
                            <span className="text-xs text-gray-400">
                              {new Date(Number(userItem.lastLogin)).toLocaleTimeString('en-GB', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                              })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Never</span>
                      )}
                    </td>
                    {user?.role === 'root_admin' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {userItem.role !== 'root_admin' && (
                          <button
                            onClick={() => handleDeleteUser(userItem.uid, userItem.email || '')}
                            disabled={['admin', 'root_admin'].includes(userItem.role) ||
                              userItem.uid === user?.uid ||
                              isDeleting[userItem.uid]}
                            className={`ml-2 flex items-center space-x-1 ${(['admin', 'root_admin'].includes(userItem.role) ||
                                userItem.uid === user?.uid ||
                                isDeleting[userItem.uid])
                                ? 'text-gray-400 cursor-not-allowed'
                                : 'text-red-600 hover:text-red-900'
                              }`}
                            title={
                              userItem.uid === user?.uid
                                ? 'Cannot delete your own account'
                                : (['admin', 'root_admin'].includes(userItem.role))
                                  ? 'Cannot delete admin users'
                                  : 'Delete User'
                            }
                          >
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={['admin', 'root_admin'].includes(userItem.role) || userItem.uid === user?.uid ? 1.5 : 2}
                            >
                              {isDeleting[userItem.uid] ? (
                                <>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </>
                              ) : (
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              )}
                            </svg>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 border-l-4 border-yellow-400">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              Only root admins can manage other admins and delete users. Regular admins can only view users.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Add display name for better debugging
AdminDashboard.displayName = 'AdminDashboard';

export default AdminDashboard;
