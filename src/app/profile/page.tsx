'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  FiUser,
  FiLock,
  FiTrash2,
  FiAlertTriangle,
  FiMail,
  FiCalendar,
  FiClock,
  FiInfo,
  FiShield,
  FiHardDrive,
  FiFileText,
  FiDatabase,
  FiMessageSquare
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { getFirestore } from 'firebase/firestore';
import { getStorage, ref, getMetadata } from 'firebase/storage';
import { getDatabase, ref as dbRef, get, child } from 'firebase/database';
import { auth } from '@/lib/firebase/config';

// Get Database and Storage instances
const db = getDatabase();
const storage = getStorage();

export default function ProfilePage() {
  const { user, logout, updatePassword, deleteAccount, deleteMessage } = useAuth();
  const router = useRouter();

  // Define the type for active tab
  // Define the tab types as a union of string literals
  type TabType = 'details' | 'messages' | 'password' | 'delete';

  // State for active tab and insights data
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [noteCount, setNoteCount] = useState(0);
  const [storageUsage, setStorageUsage] = useState('0 MB');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  // Use a ref to track the initial fetch
  const hasFetched = useRef(false);

  // Mark messages as read when viewing them
  useEffect(() => {
    if (activeTab === 'messages' && user?.messages?.some((msg: { read: boolean }) => !msg.read)) {
      // In a real app, you would update the messages as read in the database here
      // No console.log needed in production
    }
  }, [activeTab, user?.messages]);

  // Password update state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete account state
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password should be at least 6 characters long');
      return;
    }

    try {
      setIsUpdating(true);

      // Update password using AuthContext
      await updatePassword(currentPassword, newPassword);

      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // toast.success('Password updated successfully');
    } catch (error: any) {
      console.error('Error updating password:', error);
      toast.error(error.message || 'Failed to update password');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    if (!deletePassword) {
      toast.error('Please enter your password to confirm account deletion');
      return;
    }

    if (!window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(true);

      // Delete account using AuthContext
      await deleteAccount(deletePassword);

      await logout();
      toast.success('Your account has been deleted successfully');
      router.push('/');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error(error.message || 'Failed to delete account');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Format date and time in the format: DD/MM/YYYY, hh:mm:ss A
  const formatDateTime = (dateInput?: string | number | Date) => {
    if (dateInput === undefined || dateInput === null) return 'First login';

    try {
      // Handle different input types
      let date: Date;

      if (dateInput instanceof Date) {
        date = dateInput;
      } else if (typeof dateInput === 'number') {
        date = new Date(dateInput);
      } else if (typeof dateInput === 'string') {
        // Handle string that might be a number
        const num = Number(dateInput);
        date = isNaN(num) ? new Date(dateInput) : new Date(num);
      } else {
        console.warn('Unsupported date format:', dateInput);
        return 'First login';
      }

      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date:', dateInput);
        return 'First login';
      }

      // Format: DD/MM/YYYY, hh:mm:ss A (e.g., 28/05/2025, 09:29:25 AM)
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = String(hours % 12 || 12).padStart(2, '0');

      return `${day}/${month}/${year}, ${formattedHours}:${minutes}:${seconds} ${ampm}`;
    } catch (error) {
      console.error('Error formatting date/time:', error, { dateInput });
      return 'First login';
    }
  };

  // Calculate time since last login with better error handling
  const getTimeSinceLastLogin = (lastLogin?: string | number | Date) => {
    if (lastLogin === undefined || lastLogin === null) return 'First time login';

    try {
      // Handle both string timestamps and Firebase timestamps
      const lastLoginDate = new Date(
        typeof lastLogin === 'number'
          ? lastLogin
          : (typeof lastLogin === 'string' && !isNaN(Number(lastLogin))
            ? Number(lastLogin)
            : lastLogin)
      );

      // Check if the date is valid
      if (isNaN(lastLoginDate.getTime())) {
        console.warn('Invalid last login date:', lastLogin);
        return 'N/A';
      }

      const now = new Date();
      const diffInMs = now.getTime() - lastLoginDate.getTime();

      // Convert to seconds, minutes, hours, days
      const seconds = Math.floor(diffInMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days} day${days !== 1 ? 's' : ''} ago`;
      if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
      if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      if (seconds > 30) return 'Less than a minute ago';
      return 'Active now';
    } catch (error) {
      console.error('Error calculating time since last login:', error, { lastLogin });
      return 'N/A';
    }
  };

  // Handle message deletion
  const handleDeleteMessage = async (messageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteMessage(messageId);
      toast.success('Message deleted');
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  useEffect(() => {
    // Skip if we don't have a user
    if (!user?.uid) {
      setNoteCount(0);
      setStorageUsage('0 Bytes');
      setIsLoading(false);
      return () => { }; // Return empty cleanup function
    }

    // Skip if we've already fetched
    if (hasFetched.current) {
      return () => { }; // Return empty cleanup function
    }

    hasFetched.current = true;
    let isMounted = true; // Track if component is still mounted
    let abortController: AbortController | null = new AbortController();

    const fetchUserNotes = async () => {
      // Don't proceed if component is unmounted or user is not authenticated
      if (!isMounted || !user?.uid) {
        return;
      }

      setIsLoading(true);
      setStorageLoading(true);
      setError(null);

      // Check if the request was aborted
      if (abortController?.signal.aborted) {
        return;
      }

      try {
        // 1. Get all notes from the notes node
        const notesRef = dbRef(db, 'notes');
        const notesSnapshot = await get(notesRef);

        // Initialize allNotes as an empty object by default
        const allNotes = notesSnapshot.exists() ? notesSnapshot.val() : {};
        const noteIds = Object.keys(allNotes);

        // 2. Get user's folders to calculate total notes
        const userFoldersRef = dbRef(db, `users/${user.uid}/folders`);
        const userFoldersSnapshot = await get(userFoldersRef);

        // Initialize total notes count
        let totalNotes = 0;

        // Process folders if they exist
        if (userFoldersSnapshot.exists()) {
          // Get the array of folder IDs directly from the snapshot
          const folderIds: string[] = userFoldersSnapshot.val() || [];

          if (folderIds.length > 0) {
            // Get all folders data to access their noteIds
            const folderPromises = folderIds.map((folderId: string) => {
              const folderRef = dbRef(db, `folders/${folderId}`);
              return get(folderRef);
            });

            const folderSnapshots = await Promise.all(folderPromises);

            // Process each folder to count notes
            folderSnapshots.forEach((snapshot, index) => {
              if (snapshot.exists()) {
                const folderData = snapshot.val();

                // Check if noteIds exists and is an array
                const hasNoteIds = folderData.hasOwnProperty('noteIds');
                const isNoteIdsArray = Array.isArray(folderData.noteIds);
                const noteCount = isNoteIdsArray ? folderData.noteIds.length : 0;

                // Add this folder's note count to the total
                if (isNoteIdsArray) {
                  totalNotes += noteCount;
                }
              }
            });
          }
        }

        // Set the total note count
        setNoteCount(totalNotes);

        // If no notes, set storage to 0 and return
        if (totalNotes === 0) {
          setStorageUsage('0 Bytes');
          return;
        }

        // 3. Calculate total size of all notes
        let totalSize = 0;

        // Process all notes to calculate total size
        for (const noteId in allNotes) {
          const note = allNotes[noteId];

          if (!note) {
            continue;
          }

          let noteSize = 0;

          // Calculate content size
          if (note.content) {
            const contentSize = new Blob([note.content]).size;
            noteSize += contentSize;
          }

          // Calculate attachments size if any
          if (note.attachments) {
            Object.entries(note.attachments).forEach(([_, attachment]: [string, any]) => {
              if (attachment.size) {
                const attachmentSize = Number(attachment.size) || 0;
                noteSize += attachmentSize;
              }
            });
          }
          totalSize += noteSize;
        }

        // Format the storage size for display
        const formatStorageSize = (bytes: number) => {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.min(
            Math.floor(Math.log(bytes) / Math.log(k)),
            sizes.length - 1
          );
          return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
        };

        setStorageUsage(formatStorageSize(totalSize));
      } catch (err) {
        console.error('Error calculating storage:', err);
        setError('Failed to calculate storage usage');
      } finally {
        setIsLoading(false);
        setStorageLoading(false);
      }
    };

    fetchUserNotes().catch(error => {
      if (error.name !== 'AbortError') {
        console.error('Error in fetchUserNotes:', error);
      }
    });

    // Cleanup function
    return () => {
      isMounted = false;
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      hasFetched.current = false;
    };
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <div className="flex items-center">
              <div className="bg-blue-100 p-3 rounded-full">
                <FiUser className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <h2 className="text-2xl font-bold text-gray-900">Profile Settings</h2>
                <p className="text-gray-600">{user?.email}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row">
            {/* Sidebar Navigation */}
            <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50">
              <nav className="flex-1 px-2 py-4 space-y-1">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-md ${activeTab === 'details'
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <FiInfo className="mr-3 h-5 w-5" />
                  Account Details
                </button>
                <button
                  onClick={() => setActiveTab('messages')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-md ${activeTab === 'messages'
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <FiMessageSquare className="mr-3 h-5 w-5" />
                  Messages
                </button>
                <button
                  onClick={() => setActiveTab('password')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-md ${activeTab === 'password'
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <FiLock className="mr-3 h-5 w-5" />
                  Change Password
                </button>
                <button
                  onClick={() => setActiveTab('delete')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-md ${activeTab === 'delete'
                    ? 'bg-red-50 text-red-700 border-l-4 border-red-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <FiTrash2 className="mr-3 h-5 w-5" />
                  Delete Account
                </button>
              </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-6">
              {activeTab === 'messages' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Messages</h3>
                    <p className="mt-1 text-sm text-gray-500">Your recent notifications and messages</p>
                  </div>

                  <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                    <div className="max-h-[360px] overflow-y-auto">
                      {user?.messages?.length ? (
                        <ul className="divide-y divide-gray-200">
                          {user.messages
                            .sort((a, b) => b.timestamp - a.timestamp) // Sort by newest first
                            .map((message) => (
                            <li key={message.id} className={`px-4 py-4 sm:px-6 ${!message.read ? 'bg-blue-50' : ''}`}>
                              <div className="p-3 rounded-lg">
                                <div className="flex justify-between items-start">
                                  <p className="text-sm text-black">{message.content}</p>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xs text-gray-500 whitespace-nowrap">
                                    {new Date(message.timestamp).toLocaleString('en-GB', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false
                                    }).replace(',', '')}
                                  </span>
                                    <button
                                      onClick={(e) => handleDeleteMessage(message.id, e)}
                                      className="text-red-500 hover:text-red-700 dark:hover:text-red-400 text-sm"
                                      title="Delete message"
                                    >
                                      <FiTrash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="px-4 py-5 sm:p-6 text-center text-gray-500">
                          No messages yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Account Details Section */}
              {activeTab === 'details' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Account Information</h3>
                    <p className="mt-1 text-sm text-gray-500">View and manage your account details</p>
                  </div>
                  <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                    <div className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <FiMail className="mr-2" /> Email address
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                        {user?.email}
                      </dd>
                    </div>
                    <div className="border-t border-gray-200 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <FiCalendar className="mr-2" /> Account created
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                        {user?.metadata?.creationTime 
                          ? formatDateTime(user.metadata.creationTime)
                          : 'N/A'}
                      </dd>
                    </div>
                    <div className="border-t border-gray-200 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <FiClock className="mr-2" /> Last login
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                        {user?.previousLogin
                          ? formatDateTime(user.previousLogin)
                          : 'Account created in this session'}
                      </dd>
                    </div>

                    <div className="border-t border-gray-200 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <FiShield className="mr-2" /> Account role
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 capitalize">
                          {user?.role || 'user'}
                        </span>
                      </dd>
                    </div>
                  </div>

                  {/* Insights Section */}
                  <div className="mt-8">
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Usage Insights</h3>
                    <p className="mt-1 text-sm text-gray-500">Your account usage and statistics</p>

                    {isLoading ? (
                      <div className="mt-4 animate-pulse space-y-4">
                        <div className="h-20 bg-gray-200 rounded-md"></div>
                        <div className="h-20 bg-gray-200 rounded-md"></div>
                      </div>
                    ) : (
                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Total Notes Card */}
                        <div className="bg-white overflow-hidden shadow rounded-lg">
                          <div className="px-4 py-5 sm:p-6">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                                <FiFileText className="h-6 w-6 text-white" />
                              </div>
                              <div className="ml-5 w-0 flex-1">
                                <dl>
                                  <dt className="text-sm font-medium text-gray-500 truncate">
                                    Total Notes
                                  </dt>
                                  <dd className="flex items-baseline">
                                    <div className="text-2xl font-semibold text-gray-900">
                                      {noteCount}
                                    </div>
                                  </dd>
                                </dl>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Storage Used Card */}
                        <div className="bg-white overflow-hidden shadow rounded-lg">
                          <div className="px-4 py-5 sm:p-6">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                                <FiDatabase className="h-6 w-6 text-white" />
                              </div>
                              <div className="ml-5 w-0 flex-1">
                                <dl>
                                  <dt className="text-sm font-medium text-gray-500 truncate">
                                    Storage Used
                                  </dt>
                                  <dd className="flex items-baseline">
                                    <div className="text-2xl font-semibold text-gray-900">
                                      {storageUsage}
                                    </div>
                                  </dd>
                                </dl>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Change Password Section */}
              {activeTab === 'password' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Change Password</h3>
                    <p className="mt-1 text-sm text-gray-500">Update your account password</p>
                  </div>
                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div>
                      <label htmlFor="current-password" className="block text-sm font-medium text-gray-700">
                        Current Password
                      </label>
                      <input
                        type="password"
                        id="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
                        New Password
                      </label>
                      <input
                        type="password"
                        id="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        required
                        minLength={6}
                      />
                    </div>
                    <div>
                      <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        id="confirm-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        required
                        minLength={6}
                      />
                    </div>
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isUpdating}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isUpdating ? 'Updating...' : 'Update Password'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Delete Account Section */}
              {activeTab === 'delete' && (
                <div className="space-y-6">
                  <div className="bg-red-50 border-l-4 border-red-400 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <FiAlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Danger Zone</h3>
                        <div className="mt-2 text-sm text-red-700">
                          <p>This action cannot be undone. All your data will be permanently deleted.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    {!showDeleteConfirm ? (
                      <div className="relative inline-block">
                        <div className="relative group">
                          <button
                            type="button"
                            onClick={() => user?.role !== 'root_admin' && setShowDeleteConfirm(true)}
                            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                              user?.role === 'root_admin' 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                            } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                          >
                            <FiTrash2 className="mr-2 h-4 w-4" />
                            Delete My Account
                          </button>
                          {user?.role === 'root_admin' && (
                            <div className="absolute z-10 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-200 w-56 bg-gray-800 text-white text-xs rounded p-2 left-1/2 transform -translate-x-1/2 -translate-y-full -top-2">
                              Root admin cannot be deleted
                              <div className="absolute w-3 h-3 bg-gray-800 transform rotate-45 -bottom-1.5 left-1/2 -translate-x-1/2"></div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="delete-password" className="block text-sm font-medium text-gray-700">
                            Enter your password to confirm account deletion
                          </label>
                          <input
                            type="password"
                            id="delete-password"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-red-500 focus:outline-none focus:ring-red-500 sm:text-sm"
                            placeholder="Enter your password"
                            required
                          />
                        </div>
                        <div className="flex space-x-3">
                          <button
                            type="button"
                            onClick={() => {
                              setShowDeleteConfirm(false);
                              setDeletePassword('');
                            }}
                            className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleDeleteAccount}
                            disabled={isDeleting}
                            className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isDeleting ? 'Deleting...' : 'Permanently Delete Account'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
