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

export interface AppUser extends Omit<User, 'displayName' | 'photoURL'> {
  role?: UserRole;
  createdAt?: number;
  lastLogin?: number;
  displayName?: string | null;
  photoURL?: string | null;
  notes?: string[]; // Array of note IDs
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
  deleteAccount: async () => { }
};

const AuthContext = createContext<AuthContextType>(defaultContextValue);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const db = getDatabase();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Get user data from database
          const userRef = ref(db, `users/${firebaseUser.uid}`);
          const snapshot = await get(userRef);

          let appUser: AppUser = {
            ...firebaseUser,
            role: 'user',
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL
          };

          // If user data exists in database, update the user state with the role
          if (snapshot.exists()) {
            const userData = snapshot.val();
            // Ensure notes array exists
            const userNotes = Array.isArray(userData.notes) ? userData.notes : [];

            // Update user data in database if notes array was missing or invalid
            if (!Array.isArray(userData.notes)) {
              await update(userRef, { notes: userNotes });
            }

            appUser = {
              ...appUser,
              role: userData.role || 'user',
              displayName: userData.displayName || appUser.displayName,
              photoURL: userData.photoURL || appUser.photoURL,
              notes: userNotes // Add notes to the app user object
            };
          } else {
            // If no user data exists, create it with default 'user' role and empty notes array
            const newUserData = {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
              photoURL: firebaseUser.photoURL || '',
              role: 'user' as UserRole,
              createdAt: Date.now(),
              lastLogin: Date.now(),
              notes: [] // Initialize empty notes array
            };
            await set(userRef, newUserData);
            // Add notes to the app user object
            appUser.notes = [];
          }

          setUser(appUser);
        } catch (error) {
          console.error('Error loading user data:', error);
          // Fallback to basic user data if database access fails
          const appUser: AppUser = {
            ...firebaseUser,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            role: 'user'
          };
          setUser(appUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

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
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      if (firebaseUser) {
        // Get user data from database
        const userRef = ref(db, `users/${firebaseUser.uid}`);
        const snapshot = await get(userRef);

        // Prepare user data with default values
        let userData = snapshot.exists() ? snapshot.val() : null;
        let notes: string[] = [];

        if (userData) {
          // Ensure notes array exists and is valid
          notes = Array.isArray(userData.notes) ? userData.notes : [];

          // Update notes array in database if it was missing or invalid
          if (!Array.isArray(userData.notes)) {
            await update(userRef, { notes });
          }

          // Update last login time
          await update(userRef, {
            lastLogin: Date.now()
          });

          setUser({
            ...firebaseUser,
            role: userData.role || 'user',
            displayName: firebaseUser.displayName || userData.displayName,
            photoURL: firebaseUser.photoURL || userData.photoURL,
            notes // Add notes to the user object
          });
        } else {
          // If no user data exists, create it with default 'user' role and empty notes array
          const newUserData = {
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || email.split('@')[0],
            photoURL: firebaseUser.photoURL || '',
            role: 'user' as UserRole,
            createdAt: Date.now(),
            lastLogin: Date.now(),
            notes: [] // Initialize empty notes array
          };
          await set(userRef, newUserData);

          setUser({
            ...firebaseUser,
            role: 'user',
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            notes: [] // Add empty notes array to the user object
          });
        }
      }

      toast.success('Successfully logged in!');
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
      const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(emailFirstLetter)}&background=random&color=fff`;
      
      // Explicitly set notes as an empty array
      const userData = {
        email: user.email,
        displayName: displayName,
        photoURL: fallbackAvatar, // Use fallback avatar with first letter of email
        role: 'user' as UserRole,
        createdAt: Date.now(),
        lastLogin: Date.now(),
        notes: [] // Explicitly initialize empty notes array
      };

      // 3. Save user data to Realtime Database
      const userRef = ref(db, `users/${user.uid}`);
      await set(userRef, userData);

      // 4. Update auth profile
      await updateProfile(user, { displayName });

      // 5. Sign in the user
      await signInWithEmailAndPassword(auth, email, password);
      toast.success('Account created successfully!');

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

      toast.success('Successfully logged in with Google!');

      // 2. Prepare user data for database
      const userRef = ref(db, `users/${firebaseUser.uid}`);
      const snapshot = await get(userRef);
      const isNewUser = !snapshot.exists();
      let userData: any;

      // Get the Google profile photo URL (make sure it's not a default icon)
      const googlePhotoUrl = firebaseUser.photoURL && !firebaseUser.photoURL.includes('googleusercontent') 
        ? firebaseUser.photoURL 
        : firebaseUser.providerData?.[0]?.photoURL || '';

      if (isNewUser) {
        // New user - create with empty notes array and Google photo
        userData = {
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          photoURL: googlePhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(
            (firebaseUser.displayName || firebaseUser.email?.[0] || 'U').toUpperCase()
          )}&background=random&color=fff`,
          role: 'user' as UserRole,
          createdAt: Date.now(),
          lastLogin: Date.now(),
          notes: []
        };

        // Save the new user data
        await set(userRef, userData);
      } else {
        // Existing user - update last login time and photoURL if missing
        const existingData = snapshot.val();
        
        // Only update photoURL if it's not set or if we have a new Google photo
        const shouldUpdatePhoto = !existingData.photoURL || 
          (googlePhotoUrl && !existingData.photoURL.includes('googleusercontent'));

        userData = {
          ...existingData,
          lastLogin: Date.now(),
          // Only update photoURL if it's not set or if we have a new Google photo
          ...(shouldUpdatePhoto ? { photoURL: googlePhotoUrl } : {})
        };

        // Only update if there are changes
        if (JSON.stringify(userData) !== JSON.stringify({ ...existingData, lastLogin: userData.lastLogin })) {
          await update(userRef, userData);
        }
      }

      // Update the user state with the latest data
      setUser({
        ...firebaseUser,
        ...userData,
        // Make sure photoURL is set from our data
        photoURL: userData.photoURL || firebaseUser.photoURL
      });

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

  const router = useRouter();

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

        console.log('User deletion successful:', responseData);
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
        ...(userData as object)
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
  };

  // Return the provider with the context value
  const content = !loading ? children : null;

  const element = React.createElement(
    AuthContext.Provider,
    { value: contextValue },
    content
  );

  // @ts-ignore
  return element;
};

// Export the useAuth hook
export const useAuth = (): AuthContextType => {
  return useContext(AuthContext);
};

// Export the AuthContext as default
export default AuthContext;
