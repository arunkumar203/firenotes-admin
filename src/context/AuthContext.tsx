'use client';

import * as React from 'react';
import { createContext, useContext, useEffect, useState, useRef, ReactNode, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  UserCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  deleteUser as deleteAuthUser
} from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import toast from 'react-hot-toast';
import { getDatabase, ref, set, get, update, remove, query, orderByChild, equalTo } from 'firebase/database';

export type UserRole = 'user' | 'admin' | 'root_admin';

export interface UserMessage {
  id: string;
  type: 'welcome_back' | 'info' | 'warning' | 'success';
  content: string;
  timestamp: number;
  read: boolean;
}

export interface AppUser extends Omit<User, 'displayName' | 'photoURL'> {
  role?: UserRole;
  createdAt?: number;
  lastLogin?: number | null;      // Current login time
  previousLogin?: number | null; // Previous login time
  displayName?: string | null;
  photoURL?: string | null;
  notes?: string[]; // Array of note IDs
  messages?: UserMessage[]; // Array of user messages
}

type AuthContextType = {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  getAllUsers: () => Promise<Record<string, any>[]>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
};

// Create a default context value that matches AuthContextType
const defaultContextValue: AuthContextType = {
  user: null,
  loading: true,
  login: async () => { },
  signup: async () => { },
  loginWithGoogle: async () => { },
  logout: async () => { },
  updateUserRole: async () => { },
  deleteUser: async () => { },
  getAllUsers: async () => [],
  updatePassword: async () => { },
  deleteAccount: async () => { },
  deleteMessage: async (messageId: string) => { }
};

const AuthContext = createContext<AuthContextType>(defaultContextValue);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const db = getDatabase();
  const router = useRouter();
  const isMounted = useRef(false);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Effect to handle navigation after successful authentication
  useEffect(() => {
    if (user) {
      // Only redirect if we're on the home page and not already redirecting
      if (window.location.pathname === '/') {
        // Use a small timeout to ensure the state is fully updated
        const timer = setTimeout(() => {
          // Only navigate if we're not already on the notes page
          if (window.location.pathname !== '/notes') {
            router.push('/notes');
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [user, router]);

  useEffect(() => {
    isMounted.current = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Get user data from database
          const userRef = ref(db, `users/${firebaseUser.uid}`);
          const snapshot = await get(userRef);

          if (snapshot.exists()) {
            const userData = snapshot.val();
            const now = Date.now();

            // Always update the login timestamps on page load
            // But only if we haven't updated them in the last 5 minutes
            const lastUpdate = userData.lastLogin || 0;
            const shouldUpdateTimestamps = (now - lastUpdate) > (5 * 60 * 1000);

            let lastLogin = userData.lastLogin || now;
            let previousLogin = userData.previousLogin || now;

            if (shouldUpdateTimestamps) {
              // Move current lastLogin to previousLogin
              previousLogin = lastLogin;
              lastLogin = now;

              // Update in database
              await update(userRef, {
                lastLogin,
                previousLogin
              });
            }

            // Create the app user object with the data from the database
            const appUser: AppUser = {
              ...firebaseUser,
              role: userData.role || 'user',
              createdAt: userData.createdAt || now,
              lastLogin,
              previousLogin: previousLogin === lastLogin ? null : previousLogin, // Don't show previous login if it's the same as last login
              displayName: firebaseUser.displayName || userData.displayName || firebaseUser.email?.split('@')[0] || 'User',
              photoURL: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(
                (firebaseUser.displayName?.[0] || firebaseUser.email?.[0] || 'U').toUpperCase()
              )}&length=1&background=2563eb&color=fff`,
              notes: Array.isArray(userData.notes) ? userData.notes : [],
              messages: Array.isArray(userData.messages) ? userData.messages : [],
              email: firebaseUser.email || userData.email
            };

            setUser(appUser);
          } else {
            // If no user data exists, create it with default values
            const now = Date.now();
            const newUserData = {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              photoURL: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(
                (firebaseUser.displayName?.[0] || firebaseUser.email?.[0] || 'U').toUpperCase()
              )}&length=1&background=2563eb&color=fff`,
              role: 'user' as UserRole,
              createdAt: now,
              lastLogin: now,
              previousLogin: now, // Set to same as lastLogin for first login
              notes: [],
              messages: []
            };

            await set(userRef, newUserData);
            setUser({
              ...firebaseUser,
              ...newUserData
            });
          }
        } catch (error) {
          console.error('Error loading user data:', error);
          // Set user as null if there's an error
          setUser(null);
        }
      } else {
        // User is signed out
        setUser(null);
      }

      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [db]);

  // Set up auth state persistence
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Client-side only
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (error) {
          console.error('Failed to parse user from localStorage', error);
          localStorage.removeItem('user');
        }
      }
    }
  }, []);

  // Update localStorage when user changes
  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  const login = async (email: string, password: string): Promise<void> => {
    try {
      // First sign in the user
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      if (!firebaseUser) {
        throw new Error('No user found');
      }

      // Get user data from database
      const userRef = ref(db, `users/${firebaseUser.uid}`);
      const snapshot = await get(userRef);
      const userData = snapshot.val() || {};

      // Initialize messages array if it doesn't exist
      const messages: UserMessage[] = Array.isArray(userData.messages) ? userData.messages : [];

      const currentTime = Date.now();
      const lastLogin = userData.lastLogin || 0;
      const timeSinceLastLogin = currentTime - lastLogin;
      const daysSinceLastLogin = Math.floor(timeSinceLastLogin / (1000 * 60 * 60 * 24));

      // Always add a login message, with different content based on time since last login
      let loginMessage;

      if (lastLogin === 0) {
        // First login
        loginMessage = {
          id: `msg-${currentTime}`,
          type: 'info' as const,
          content: 'Welcome! This is your first login.',
          timestamp: currentTime,
          read: false
        };
      } else if (daysSinceLastLogin >= 2) {
        // More than 2 days since last login
        loginMessage = {
          id: `msg-${currentTime}`,
          type: 'welcome_back' as const,
          content: `Welcome back! You logged in after ${daysSinceLastLogin} days.`,
          timestamp: currentTime,
          read: false
        };
      } else {
        // Less than 2 days since last login - show minutes and seconds
        const minutes = Math.floor((timeSinceLastLogin / (1000 * 60)) % 60);
        // No message for logins within 2 days
        loginMessage = null;
      }

      // Add the message to the beginning of the messages array if it exists
      if (loginMessage) {
        messages.unshift(loginMessage);
      }

      // Get current timestamp for this login
      const currentLogin = Date.now();

      // Determine the previous login time
      // If there was a lastLogin, it becomes the new previousLogin
      // Otherwise, keep the existing previousLogin or use current time if it's the first login
      const previousLogin = userData.lastLogin
        ? userData.lastLogin
        : (userData.previousLogin || currentLogin);

      // Always update the timestamps on login
      const updates: Partial<AppUser> = {
        displayName: firebaseUser.displayName || userData.displayName || firebaseUser.email?.split('@')[0] || 'User',
        photoURL: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(
          (firebaseUser.displayName?.[0] || firebaseUser.email?.[0] || 'U').toUpperCase()
        )}&length=1&background=2563eb&color=fff`,
        notes: Array.isArray(userData.notes) ? userData.notes : [],
        messages: messages.slice(0, 100), // Keep only the 100 most recent messages
        email: firebaseUser.email || userData.email,
        // Update lastLogin to current time
        lastLogin: currentLogin,
        // Update previousLogin to the last known login time
        previousLogin: previousLogin
      };

      // Update in database
      await update(userRef, updates);

      // Update local user state with the new timestamps and messages
      const updatedUser: AppUser = {
        ...firebaseUser,
        role: userData.role || 'user',
        ...updates,
        // Ensure we have the latest timestamps
        lastLogin: updates.lastLogin || currentLogin,
        previousLogin: updates.previousLogin,
        createdAt: userData.createdAt || currentLogin
      };

      setUser(updatedUser);

      // Show success toast
      toast.success('Successfully logged in!');
      
      // Show welcome back toast if it's been more than 2 days
      if (previousLogin && (currentLogin - previousLogin) >= 2 * 24 * 60 * 60 * 1000) {
        toast(`Welcome back! You haven't logged in for ${Math.floor((currentLogin - previousLogin) / (24 * 60 * 60 * 1000))} days.`, {
          duration: 5000,
          icon: '👋',
          position: 'top-center'
        });
      }
    } catch (error: any) {
      console.error('Error signing in:', error);
      toast.error(error.message || 'Failed to log in');
      throw error;
    }
  };

  const signup = async (email: string, password: string): Promise<void> => {
    let user: User | null = null;

    try {
      // 1. First, create the user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      user = userCredential.user;

      if (!user) {
        throw new Error('Failed to create user');
      }

      // 2. Prepare user data with default 'user' role and empty notes array
      const displayName = email.split('@')[0] || 'User';
      // Create a fallback avatar using the first letter of the email
      const emailFirstLetter = email[0].toUpperCase();
      const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(emailFirstLetter)}&length=1&background=2563eb&color=fff`;

      // 3. Create welcome message for new users
      const currentTime = Date.now();
      const welcomeMessage: UserMessage = {
        id: `msg-${currentTime}`,
        type: 'success' as const,
        content: 'Welcome! Your account has been created successfully.',
        timestamp: currentTime,
        read: false
      };

      // 4. Create user data with welcome message
      const userData = {
        email: user.email,
        displayName: displayName,
        photoURL: fallbackAvatar,
        role: 'user' as UserRole,
        createdAt: currentTime,
        lastLogin: currentTime,
        previousLogin: null,
        notes: [],
        messages: [welcomeMessage]
      };

      // 5. First, save the welcome message to the database
      const userRef = ref(db, `users/${user.uid}`);

      // 6. Create the initial user data with the welcome message
      const initialUserData = {
        ...userData,
        messages: [welcomeMessage]
      };

      // 7. Save the complete user data with welcome message to the database
      await set(userRef, initialUserData);

      // 8. Update auth profile
      await updateProfile(user, {
        displayName,
        photoURL: fallbackAvatar
      });

      // 9. Sign in the user
      const { user: signedInUser } = await signInWithEmailAndPassword(auth, email, password);

      // 10. Update the user state with the data we just saved
      setUser({
        ...signedInUser,
        ...initialUserData
      });

      // 11. Show welcome message
      toast(welcomeMessage.content, {
        duration: 5000,
        icon: '👋',
        position: 'top-center'
      });

      // 12. Double-check that the message is in the database
      const dbSnapshot = await get(userRef);
      const dbUserData = dbSnapshot.val() || initialUserData;

      if (!dbUserData.messages || !dbUserData.messages.some((msg: UserMessage) => msg.id === welcomeMessage.id)) {
        // If for some reason the message is missing, add it
        const updatedMessages = [welcomeMessage, ...(dbUserData.messages || [])];
        await update(userRef, {
          messages: updatedMessages,
          // Also ensure other critical fields are set
          email: dbUserData.email || email,
          displayName: dbUserData.displayName || displayName,
          photoURL: dbUserData.photoURL || fallbackAvatar,
          role: dbUserData.role || 'user',
          createdAt: dbUserData.createdAt || Date.now(),
          lastLogin: dbUserData.lastLogin || Date.now()
        });
      }

    } catch (error: any) {
      console.error('Signup error:', error);

      // Clean up if user was created but something else failed
      if (user) {
        try {
          await user.delete();
          console.log('Rolled back user creation due to error');
        } catch (deleteError) {
          console.error('Failed to rollback user creation:', deleteError);
        }
      }

      // Re-throw with a user-friendly message
      if (error instanceof Error) {
        if (error.message.includes('email-already-in-use')) {
          throw new Error('This email is already in use. Please use a different email or sign in.');
        } else if (error.message.includes('weak-password')) {
          throw new Error('Password should be at least 6 characters long.');
        } else if (error.message.includes('invalid-email')) {
          throw new Error('Please enter a valid email address.');
        }
      }

      throw new Error('Failed to create account. Please try again later.');
    }
  };

  const loginWithGoogle = async (): Promise<void> => {
    let firebaseUser: User | null = null;

    try {
      // 1. Sign in with Google
      const provider = new GoogleAuthProvider();
      // Request additional profile information including the profile picture
      provider.addScope('profile');
      provider.addScope('email');

      const result = await signInWithPopup(auth, provider);
      firebaseUser = result.user;

      if (!firebaseUser) {
        throw new Error('Failed to sign in with Google');
      }

      // 2. Prepare user data for database
      const userRef = ref(db, `users/${firebaseUser.uid}`);
      const snapshot = await get(userRef);
      const isNewUser = !snapshot.exists();
      let userData: any;

      // Get the Google profile photo URL (make sure it's not a default icon)
      const googlePhotoUrl = firebaseUser.photoURL && !firebaseUser.photoURL.includes('googleusercontent')
        ? firebaseUser.photoURL
        : firebaseUser.providerData?.[0]?.photoURL || '';

      const currentLogin = Date.now();

      // Initialize messages array if it doesn't exist
      const messages: UserMessage[] = [];

      if (isNewUser) {
        // New user - create with empty notes array and Google photo
        const newUserMessage: UserMessage = {
          id: `msg-${currentLogin}`,
          type: 'success' as const,
          content: 'Welcome! Your Google account has been connected successfully.',
          timestamp: currentLogin,
          read: false
        };

        // Create user data with welcome message
        userData = {
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          photoURL: googlePhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(
            (firebaseUser.displayName?.[0] || firebaseUser.email?.[0] || 'U').toUpperCase()
          )}&length=1&background=2563eb&color=fff`,
          role: 'user' as UserRole,
          createdAt: currentLogin,
          lastLogin: currentLogin,
          previousLogin: null, // For new users, previousLogin is null
          notes: [],
          messages: [newUserMessage] // Only include the new message, not the entire messages array
        };

        // Save the new user data with welcome message
        await set(userRef, userData);

        // Update the user state with the latest data including messages
        setUser({
          ...firebaseUser,
          ...userData
        });

        // Show success toast for new users
        setTimeout(() => {
          toast.success('Successfully signed in with Google!');
          // Show welcome message for new users
          toast(newUserMessage.content, {
            duration: 5000,
            icon: '👋',
            position: 'top-center'
          });
        }, 100);
      } else {
        // Existing user - update login times and photoURL if needed
        const existingData = snapshot.val();
        const lastLogin = existingData.lastLogin || 0;
        const timeSinceLastLogin = currentLogin - lastLogin;
        const daysSinceLastLogin = Math.floor(timeSinceLastLogin / (1000 * 60 * 60 * 24));

        // Get existing messages or initialize empty array
        const messages: UserMessage[] = Array.isArray(existingData.messages) ? existingData.messages : [];

        // Only create a login message for account creation or if not logged in for more than 2 days
        if (lastLogin === 0) {
          // First login - show account creation welcome message
          const welcomeMessage: UserMessage = {
            id: `msg-${currentLogin}`,
            type: 'info' as const,
            content: 'Welcome! Your account has been created successfully.',
            timestamp: currentLogin,
            read: false
          };
          messages.unshift(welcomeMessage);
        } else if (daysSinceLastLogin >= 2) {
          // More than 2 days since last login
          const welcomeBackMessage: UserMessage = {
            id: `msg-${currentLogin}`,
            type: 'welcome_back' as const,
            content: `You haven't logged in for ${daysSinceLastLogin} days. Welcome back!`,
            timestamp: currentLogin,
            read: false
          };
          messages.unshift(welcomeBackMessage);
        }
        // No message for logins within 2 days

        // Only keep the 100 most recent messages
        const recentMessages = messages.slice(0, 100);

        // For existing users, only update previousLogin if lastLogin exists
        const previousLogin = lastLogin || null;

        // Only update photoURL if it's not set or if we have a new Google photo
        const shouldUpdatePhoto = !existingData.photoURL ||
          (googlePhotoUrl && !existingData.photoURL.includes('googleusercontent'));

        userData = {
          ...existingData,
          lastLogin: currentLogin,
          ...(previousLogin !== null && { previousLogin }), // Only include if not null
          // Only update photoURL if it's not set or if we have a new Google photo
          ...(shouldUpdatePhoto ? { photoURL: googlePhotoUrl } : {}),
          messages: recentMessages
        };

        // Prepare update data
        const updateData: any = {
          lastLogin: currentLogin,
          messages: recentMessages,
          ...(previousLogin !== null && { previousLogin })
        };

        if (shouldUpdatePhoto) {
          updateData.photoURL = googlePhotoUrl;
        }

        // Update in database
        await update(userRef, updateData);

        // Show success toast and welcome back message if it's been more than 2 days
        setTimeout(() => {
          toast.success('Successfully signed in with Google!');
          if (daysSinceLastLogin >= 2) {
            toast(`Welcome back! You haven't logged in for ${daysSinceLastLogin} days.`, {
              duration: 5000,
              icon: '👋',
              position: 'top-center'
            });
          }
        }, 100);

      }

      // Update the user state with the latest data
      if (userData) {
        setUser({
          ...firebaseUser,
          ...userData,
          // Make sure photoURL is set from our data
          photoURL: userData.photoURL || firebaseUser.photoURL
        });
      }

      // The navigation will be handled by the useEffect that watches for user changes
      // No need to redirect here as it will be handled by the effect

    } catch (error: any) {
      console.error('Google sign-in error:', error);

      // If we have a user object but something failed, try to clean up
      if (firebaseUser) {
        try {
          // Only delete the user if this was a new signup that failed
          const userRef = ref(db, `users/${firebaseUser.uid}`);
          const snapshot = await get(userRef);
          if (!snapshot.exists()) {
            await firebaseUser.delete();
            console.log('Rolled back user creation due to error');
          }
        } catch (cleanupError) {
          console.error('Failed to clean up after Google sign-in error:', cleanupError);
        }
      }

      throw error;
    }
  };



  const logout = async () => {
    try {
      // Sign out from Firebase
      await signOut(auth);

      // Clear local storage
      localStorage.removeItem('user');

      // Navigate to home page
      router.push('/');

    } catch (error: any) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  // Update a user's role (only accessible by root_admin)
  const updateUserRole = async (userId: string, role: UserRole): Promise<void> => {
    try {
      if (!user) throw new Error('Not authenticated');
      if (user.uid === userId) throw new Error('Cannot change your own role');

      const userRef = ref(db, `users/${userId}`);
      const snapshot = await get(userRef);

      if (!snapshot.exists()) {
        throw new Error('User not found');
      }

      const userData = snapshot.val();

      // Only root_admin can change roles to/from root_admin
      if (user.role !== 'root_admin' && (role === 'root_admin' || userData.role === 'root_admin')) {
        throw new Error('Insufficient permissions');
      }

      await update(userRef, { role });
      toast.success('User role updated successfully');
    } catch (error: any) {
      console.error('Error updating user role:', error);
      toast.error(error.message || 'Failed to update user role');
      throw error;
    }
  };

  const deleteUser = async (userId: string): Promise<void> => {
    const toastId = toast.loading('Deleting user...');

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      // Check if current user is root_admin
      const currentUserRef = ref(db, `users/${currentUser.uid}`);
      const currentUserSnapshot = await get(currentUserRef);

      if (!currentUserSnapshot.exists()) {
        throw new Error('Your account data was not found');
      }

      const currentUserData = currentUserSnapshot.val();
      const currentUserRole = currentUserData?.role;

      if (currentUserRole !== 'root_admin') {
        throw new Error('Only root admin can delete users');
      }

      // Check if user exists
      const userRef = ref(db, `users/${userId}`);
      const userSnapshot = await get(userRef);

      if (!userSnapshot.exists()) {
        throw new Error('User not found');
      }

      const userData = userSnapshot.val();

      // Don't allow deleting other root_admins or self
      if (userData.role === 'root_admin') {
        throw new Error('Cannot delete another root admin');
      }

      if (userId === currentUser.uid) {
        throw new Error('Cannot delete your own account');
      }

      // 1. Get all folders owned by the user
      const userFoldersRef = ref(db, `users/${userId}/folders`);
      const userFoldersSnapshot = await get(userFoldersRef);
      const folderIds = userFoldersSnapshot.exists()
        ? (Array.isArray(userFoldersSnapshot.val())
          ? [...userFoldersSnapshot.val()]
          : Object.keys(userFoldersSnapshot.val() || {}))
        : [];

      // 2. For each folder, get its notes and delete them
      const folderPromises = folderIds.map(async (folderId: string) => {
        const folderRef = ref(db, `folders/${folderId}`);
        const folderSnapshot = await get(folderRef);

        if (folderSnapshot.exists()) {
          const folderData = folderSnapshot.val();
          // Delete all notes in this folder
          if (folderData.noteIds && Array.isArray(folderData.noteIds)) {
            const noteDeletions = folderData.noteIds.map((noteId: string) =>
              remove(ref(db, `notes/${noteId}`))
            );
            await Promise.all(noteDeletions);
          }
          // Delete the folder
          await remove(folderRef);
        }
      });

      // 3. Delete all user's folders and their data
      await Promise.all(folderPromises);

      // 4. Delete any remaining standalone notes
      const userNotesRef = query(
        ref(db, 'notes'),
        orderByChild('userId'),
        equalTo(userId)
      );

      const notesSnapshot = await get(userNotesRef);
      if (notesSnapshot.exists()) {
        const noteDeletions = Object.keys(notesSnapshot.val()).map(noteId =>
          remove(ref(db, `notes/${noteId}`))
        );
        await Promise.all(noteDeletions);
      }

      // 5. Finally, delete the user's data
      await remove(userRef);

      try {
        // 3. Finally, delete from Firebase Auth
        const idToken = await currentUser.getIdToken();
        const response = await fetch('/api/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ userId })
        });

        const responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
          console.error('API Error Response:', responseData);
          throw new Error(responseData.error || 'Failed to delete user from authentication service');
        }

        // User deletion successful
        toast.success('User and all associated notes deleted successfully', { id: toastId });
      } catch (error) {
        console.error('Error deleting user from Auth:', error);
        // We still consider this a success since we've cleaned up the user's data and notes
        toast.success('User data and notes deleted, but there was an issue with the authentication service', { id: toastId });
      }

    } catch (error: unknown) {
      console.error('Error deleting user:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete user';
      toast.error(errorMessage, { id: toastId });
      throw error;
    }
  };

  // Get all users (only accessible by admin or root_admin)
  const getAllUsers = async (): Promise<Record<string, any>[]> => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      // Get current user's role from the database
      const currentUserRef = ref(db, `users/${currentUser.uid}`);
      const currentUserSnapshot = await get(currentUserRef);

      if (!currentUserSnapshot.exists()) {
        throw new Error('User data not found');
      }

      const currentUserData = currentUserSnapshot.val();
      const currentUserRole = currentUserData?.role || 'user';

      if (currentUserRole !== 'admin' && currentUserRole !== 'root_admin') {
        throw new Error('Insufficient permissions');
      }

      // Get all users
      const usersRef = ref(db, 'users');
      const snapshot = await get(usersRef);

      if (!snapshot.exists()) {
        return [];
      }

      const users = snapshot.val();
      return Object.entries(users).map(([uid, userData]) => ({
        uid,
        ...(userData as object),
        lastLogin: (userData as any)?.lastLogin || null,
        previousLogin: (userData as any)?.previousLogin || null
      }));
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  };

  // Update user's password
  const updateUserPassword = async (currentPassword: string, newPassword: string) => {
    if (!auth.currentUser) {
      throw new Error('No user is currently signed in');
    }

    if (!currentPassword || !newPassword) {
      throw new Error('Current password and new password are required');
    }

    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long');
    }

    try {
      // Re-authenticate the user
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email || '',
        currentPassword
      );

      await reauthenticateWithCredential(auth.currentUser, credential);

      // Update the password
      await updatePassword(auth.currentUser, newPassword);

      toast.success('Password updated successfully');
    } catch (error: any) {
      console.error('Error updating password:', error);
      if (error.code === 'auth/wrong-password') {
        throw new Error('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('New password is too weak');
      } else {
        throw new Error(error.message || 'Failed to update password');
      }
    }
  };

  // Delete user's account
  const deleteAccount = async (password: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No user is currently signed in');
    }

    if (!password) {
      throw new Error('Password is required to delete your account');
    }

    try {
      // Re-authenticate the user
      const credential = EmailAuthProvider.credential(
        currentUser.email || '',
        password
      );

      await reauthenticateWithCredential(currentUser, credential);

      // Get database reference
      const db = getDatabase();
      const userId = currentUser.uid;
      const userRef = ref(db, `users/${userId}`);

      // Get user data first
      const userSnapshot = await get(userRef);
      if (!userSnapshot.exists()) {
        throw new Error('User data not found');
      }

      const userData = userSnapshot.val();
      const notes = userData.notes || [];

      // Get all folders for the user
      const foldersRef = ref(db, 'folders');
      const foldersSnapshot = await get(foldersRef);
      const userFolders: Record<string, any> = {};

      // Find all folders belonging to this user
      if (foldersSnapshot.exists()) {
        foldersSnapshot.forEach((folder) => {
          if (folder.val().userId === userId) {
            userFolders[folder.key as string] = folder.val();
          }
        });
      }

      // Prepare updates for batch operation
      const updates: Record<string, any> = {};

      // 1. Delete all user's folders and their notes
      Object.keys(userFolders).forEach(folderId => {
        // Delete the folder
        updates[`folders/${folderId}`] = null;

        // Delete all notes in this folder
        const folderNotes = userFolders[folderId].noteIds || [];
        folderNotes.forEach((noteId: string) => {
          updates[`notes/${noteId}`] = null;
        });
      });

      // 2. Delete user data
      updates[`users/${userId}`] = null;

      // Perform all deletions in a single transaction
      await update(ref(db), updates);

      // Finally, delete the auth account
      await deleteAuthUser(currentUser);

      // Logout the user
      await logout();

      toast.success('Your account and all associated data have been deleted successfully');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      if (error.code === 'auth/wrong-password') {
        throw new Error('Incorrect password. Please try again.');
      } else {
        throw new Error(error.message || 'Failed to delete account');
      }
    }
  };

  // Delete a message from user's messages
  const deleteMessage = async (messageId: string) => {
    if (!user?.uid) return;

    try {
      const userRef = ref(db, `users/${user.uid}`);
      const snapshot = await get(userRef);
      const userData = snapshot.val();

      if (userData?.messages) {
        const updatedMessages = userData.messages.filter((msg: any) => msg.id !== messageId);
        await update(userRef, { messages: updatedMessages });

        // Update local state
        if (isMounted.current) {
          setUser(prev => prev ? { ...prev, messages: updatedMessages } : null);
        }
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  };

  // Create the context value
  const contextValue: AuthContextType = {
    user,
    loading,
    login,
    signup,
    loginWithGoogle,
    logout,
    updateUserRole,
    deleteUser,
    getAllUsers,
    updatePassword: updateUserPassword,
    deleteAccount,
    deleteMessage,
  };

  // Return the provider with the context value
  const content = !loading ? children : null;

  return (
    <AuthContext.Provider value={contextValue}>
      {content}
    </AuthContext.Provider>
  );
};

// Export the useAuth hook
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Export the AuthContext as default
export default AuthContext;
