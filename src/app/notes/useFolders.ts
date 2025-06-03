import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ref,
  onValue,
  off,
  DataSnapshot,
  push,
  set,
  update,
  get,
  remove,
  getDatabase,
  query,
  orderByChild,
  equalTo,
  Unsubscribe
} from 'firebase/database';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-hot-toast';


export interface Folder {
  id: string;
  name: string;
  userId: string;
  createdAt: number;
  noteIds?: string[];
  updatedAt?: number;
}

interface UseFoldersProps {
  currentFolderId?: string | null;
  onFolderDeleted?: (deletedFolderId: string) => void;
}

interface UseFoldersReturn {
  folders: Folder[];
  loading: boolean;
  currentFolder: Folder | null;
  createFolder: (name: string) => Promise<string>;
  deleteFolder: (id: string) => Promise<void>;
  error: string | null;
}

interface UseFoldersProps {
  currentFolderId?: string | null;
  onFolderDeleted?: (deletedFolderId: string) => void;
}

export const useFolders = ({ currentFolderId, onFolderDeleted }: UseFoldersProps = {}): UseFoldersReturn => {
  const { user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);

  const db = useMemo(() => getDatabase(), []);
  const lastProcessedUpdate = useRef<Record<string, number>>({});
  const updateInProgress = useRef(false);
  const isProcessing = useRef(false);
  const pendingUpdates = useRef<Set<string>>(new Set());
  const unsubscribeCallbacks = useRef<Unsubscribe[]>([]);
  const isMounted = useRef(true);

  // Cleanup function for useEffect
  const cleanup = useCallback(() => {
    // Set flag to prevent state updates after cleanup
    isMounted.current = false;
    
    // Reset state when cleaning up
    setFolders([]);
    setCurrentFolder(null);
    setError(null);
    setIsLoading(false);
    
    // Clear any pending updates
    pendingUpdates.current.clear();
    
    // Reset processing flags
    updateInProgress.current = false;
    isProcessing.current = false;
    
    // Unsubscribe from all listeners
    unsubscribeCallbacks.current.forEach(unsubscribe => unsubscribe());
    unsubscribeCallbacks.current = [];
  }, []);

  // Update current folder when currentFolderId changes
  useEffect(() => {
    if (currentFolderId) {
      const folder = folders.find(f => f.id === currentFolderId) || null;
      setCurrentFolder(folder);
    } else {
      setCurrentFolder(null);
    }
  }, [currentFolderId, folders]);

  // This function is now defined later in the file
  // The implementation below will be removed to avoid duplication

  // Handle folder deletion
  const handleDeleteFolder = async (id: string): Promise<void> => {
    try {
      // First, check if the folder exists and belongs to the user
      const folderRef = ref(db, `folders/${id}`);
      const snapshot = await get(folderRef);
      
      if (!snapshot.exists() || snapshot.val().userId !== user?.uid) {
        throw new Error('Folder not found or access denied');
      }

      // Delete the folder
      await remove(folderRef);

      // Call the onFolderDeleted callback if provided
      if (isMounted.current) {
        setFolders(prev => prev.filter(folder => folder.id !== id));
        
        if (onFolderDeleted) {
          onFolderDeleted(id);
        }
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  };

  // Handle folder updates
  const updateFoldersList = useCallback(async (folderIds: string[]) => {
    if (isProcessing.current || !user) return;

    isProcessing.current = true;
    setIsLoading(true);

    try {
      const now = Date.now();
      const updates: Promise<void>[] = [];
      const updatedFolders: Folder[] = [];

      // Process each folder that needs updating
      for (const folderId of folderIds) {

        // Get the folder data
        const folderSnapshot = await get(ref(db, `folders/${folderId}`));
        if (!folderSnapshot.exists()) continue;

        const folderData = folderSnapshot.val();
        const noteIds = Array.isArray(folderData.noteIds) ? folderData.noteIds : [];

        // Validate notes
        const notePromises = noteIds.map((noteId: string) =>
          get(ref(db, `notes/${noteId}`))
        );

        const noteSnapshots = await Promise.all(notePromises);
        const validNotes = noteSnapshots.filter(snapshot =>
          snapshot.exists() &&
          snapshot.val().userId === user.uid &&
          snapshot.val().folderId === folderId
        );

        const updatedNoteIds = validNotes.map(note => note.key).filter(Boolean) as string[];

        // Only update if there are changes
        if (updatedNoteIds.length !== noteIds.length) {
          const updatePromise = update(ref(db, `folders/${folderId}`), {
            noteIds: updatedNoteIds,
            updatedAt: now
          });
          updates.push(updatePromise);
        }

        // Add to updated folders
        updatedFolders.push({
          id: folderId,
          name: folderData.name || 'Unnamed Folder',

          noteIds: updatedNoteIds,
          userId: folderData.userId || user.uid,
          createdAt: folderData.createdAt || now,
          updatedAt: folderData.updatedAt || now
        });
      }

      // Wait for all updates to complete
      await Promise.all(updates);

      if (isMounted.current) {
        setFolders(prevFolders => {
          // Merge with existing folders, keeping the most recent version
          const folderMap = new Map(prevFolders.map(f => [f.id, f]));
          updatedFolders.forEach(folder => {
            folderMap.set(folder.id, folder);
          });
          return Array.from(folderMap.values())
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        });
      }

    } catch (error) {
      console.error('Error updating folders:', error);
      if (isMounted.current) {
        setError('Failed to update folders. Please try again.');
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
      isProcessing.current = false;

      // Process any pending updates
      if (pendingUpdates.current.size > 0) {
        const updates = Array.from(pendingUpdates.current);
        pendingUpdates.current.clear();
        updateFoldersList(updates);
      }
    }
  }, [db, user]);

  // Set up real-time listeners for folders
  useEffect(() => {
    isMounted.current = true;

    if (!user) {
      // Reset state when user logs out
      setFolders([]);
      setCurrentFolder(null);
      setError(null);
      setIsLoading(false);
      // Clean up any existing listeners
      cleanup();
      return;
    }

    const userRef = ref(db, `users/${user.uid}`);
    // console.log('Setting up user snapshot listener at path:', `users/${user.uid}`);

    const handleUserSnapshot = (snapshot: DataSnapshot) => {
      // console.log('User snapshot received:', snapshot.exists() ? snapshot.val() : 'no data');

      if (!isMounted.current) return;

      if (!snapshot.exists()) {
        console.log('User data not found, clearing folders');
        setFolders([]);
        setIsLoading(false);
        return;
      }
      if (!isMounted.current || !snapshot.exists()) return;

      const userData = snapshot.val();
      // console.log('Processing user data:', userData);

      let folderIds: string[] = [];

      if (Array.isArray(userData.folders)) {
        folderIds = userData.folders.filter(Boolean);
        // console.log('Found folders array with', folderIds.length, 'folders');
      } else if (userData.folders && typeof userData.folders === 'object') {
        folderIds = Object.keys(userData.folders).filter(Boolean);
        console.log('Found folders object with', folderIds.length, 'folders');
      } else {
        console.log('No folders found in user data');
      }

      // Process the folders
      if (folderIds.length > 0) {
        // console.log('Updating folders list with', folderIds.length, 'folder IDs');
        updateFoldersList(folderIds);
      } else {
        console.log('No folders found, setting empty folders array');
        setFolders([]);
        setIsLoading(false);
      }

      // Set up listeners for each folder
      // console.log('Setting up listeners for', folderIds.length, 'folders');
      folderIds.forEach(folderId => {
        const folderPath = `folders/${folderId}`;
        // console.log('Setting up listener for folder:', folderPath);
        const folderRef = ref(db, folderPath);

        const unsubscribe = onValue(folderRef, (folderSnapshot) => {
          // console.log('Folder snapshot received for', folderPath, ':', folderSnapshot.exists() ? folderSnapshot.val() : 'no data');
          if (!isMounted.current) {
            console.log('Component unmounted, skipping update');
            return;
          }

          if (!folderSnapshot.exists()) {
            console.log('Folder does not exist, skipping');
            return;
          }

          const folderData = folderSnapshot.val();
          // console.log('Updating folder data for', folderId, ':', folderData);

          setFolders(prev => {
            // console.log('Previous folders state:', prev);
            const existing = prev.find(f => f.id === folderId);
            if (existing && existing.updatedAt === folderData.updatedAt) {
              // console.log('No changes detected for folder', folderId, 'skipping update');
              return prev; // No change
            }

            const updated = prev.filter(f => f.id !== folderId);
            const newFolder = {
              id: folderId,
              name: folderData.name || 'Unnamed Folder',
              noteIds: folderData.noteIds || [],
              updatedAt: folderData.updatedAt || Date.now(),
              createdAt: folderData.createdAt || Date.now(),
              userId: folderData.userId || user?.uid || ''
            };
            updated.push(newFolder);

            const sorted = updated.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            // console.log('Updated folders list:', sorted);
            return sorted;
          });
        });

        unsubscribeCallbacks.current.push(unsubscribe);
      });
    };

    // Set up user listener
    const unsubscribeUser = onValue(userRef, handleUserSnapshot, (error) => {
      console.error('Error listening to user data:', error);
      if (isMounted.current) {
        setError('Failed to load folders. Please refresh the page.');
        setIsLoading(false);
      }
    });

    unsubscribeCallbacks.current.push(unsubscribeUser);

    // Cleanup function
    return cleanup;
  }, [db, user, updateFoldersList, cleanup]);


  const createFolder = async (name: string): Promise<string> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    const folderName = name.trim();
    if (!folderName) {
      throw new Error('Folder name cannot be empty');
    }

    try {
      // Check for duplicate folder names in the local state first
      const existingFolder = folders.find(
        folder => folder.name.toLowerCase() === folderName.toLowerCase()
      );

      if (existingFolder) {
        throw new Error('A folder with this name already exists');
      }

      const userRef = ref(db, `users/${user.uid}`);
      const userSnapshot = await get(userRef);

      // Check for duplicate folder names in the database
      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();
        const userFolderIds = userData.folders
          ? (Array.isArray(userData.folders)
            ? [...userData.folders]
            : Object.keys(userData.folders))
          : [];

        // Only check folders that aren't already in our local state
        const foldersToCheck = userFolderIds.filter(id => !folders.some(f => f.id === id));

        if (foldersToCheck.length > 0) {
          const folderPromises = foldersToCheck.map((folderId: string) =>
            get(ref(db, `folders/${folderId}`))
          );

          const folderSnapshots = await Promise.all(folderPromises);
          const duplicateFolder = folderSnapshots.some(snapshot =>
            snapshot.exists() &&
            snapshot.val().name.toLowerCase() === folderName.toLowerCase()
          );

          if (duplicateFolder) {
            throw new Error('A folder with this name already exists');
          }
        }
      }

      // Create the folder
      const newFolderRef = push(ref(db, 'folders'));
      const newFolderId = newFolderRef.key;

      if (!newFolderId) {
        throw new Error('Failed to create folder: Could not generate folder ID');
      }

      const now = Date.now();

      // Get existing folder IDs
      const userFoldersRef = ref(db, `users/${user.uid}/folders`);
      const snapshot = await get(userFoldersRef);
      const existingFolderIds: string[] = snapshot.exists()
        ? (Array.isArray(snapshot.val()) ? snapshot.val() : Object.keys(snapshot.val() || {}))
        : [];

      // Make sure the new folder ID isn't already in the list
      if (existingFolderIds.includes(newFolderId)) {
        throw new Error('Folder with this ID already exists');
      }

      // Create the new folder object with empty noteIds array
      const newFolder: Folder = {
        id: newFolderId,
        name: folderName,
        userId: user.uid,
        createdAt: now,
        updatedAt: now,
        noteIds: []
      };

      // Add the new folder ID to user's folders
      const updatedFolderIds = [...existingFolderIds, newFolderId];

      // Prepare all updates in a single atomic operation
      const updates: Record<string, any> = {
        [`folders/${newFolderId}`]: newFolder,
        [`users/${user.uid}/folders`]: updatedFolderIds
      };

      // Execute all updates atomically
      await update(ref(db), updates);

      return newFolderId;
    } catch (error) {
      console.error('Error creating folder:', error);
      throw error;
    }
  };
  const updateFolder = async (folderId: string, updates: Partial<Omit<Folder, 'id' | 'userId' | 'createdAt'>>) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const folderRef = ref(db, `folders/${folderId}`);

      // Get current folder data to verify ownership
      const folderSnapshot = await get(folderRef);
      if (!folderSnapshot.exists()) {
        throw new Error('Folder not found');
      }

      const folderData = folderSnapshot.val();
      if (folderData.userId !== user.uid) {
        throw new Error('Unauthorized to update this folder');
      }

      // If name is being updated, check for duplicate names
      if (updates.name) {
        const userRef = ref(db, `users/${user.uid}`);
        const userSnapshot = await get(userRef);

        if (userSnapshot.exists()) {
          const userData = userSnapshot.val();
          const userFolderIds = userData.folders
            ? (Array.isArray(userData.folders)
              ? userData.folders
              : Object.keys(userData.folders))
            : [];

          // Check for duplicate names in parallel
          const folderPromises = userFolderIds
            .filter((id: string) => id !== folderId)
            .map(async (id: string) => {
              const snapshot = await get(ref(db, `folders/${id}`));
              return snapshot.exists() ? snapshot.val() : null;
            });

          const otherFolders = await Promise.all(folderPromises);
          const newName = updates.name.trim().toLowerCase();
          const isDuplicate = otherFolders.some(
            folder => folder && folder.name.toLowerCase() === newName
          );

          if (isDuplicate) {
            throw new Error('A folder with this name already exists');
          }
        }
      }

      // Prepare update data
      const updateData = {
        ...updates,
        ...(updates.name ? { name: updates.name.trim() } : {}),
        updatedAt: Date.now()
      };

      // Update the folder
      await update(folderRef, updateData);

      // Show success toast with the updated folder name
      const folderName = updates.name || 'Folder';
      toast.success(`"${folderName}" updated successfully`);

      // Update local state optimistically
      if (isMounted.current) {
        setFolders(prevFolders =>
          prevFolders.map(folder =>
            folder.id === folderId
              ? { ...folder, ...updateData }
              : folder
          ).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        );
      }
    } catch (error) {
      console.error('Error updating folder:', error);
      throw error;
    }
  };

  const deleteFolder = async (id: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const folderRef = ref(db, `folders/${id}`);
      const userRef = ref(db, `users/${user.uid}`);

      // Verify folder exists and belongs to user
      const folderSnapshot = await get(folderRef);
      if (!folderSnapshot.exists()) {
        throw new Error('Folder not found');
      }

      const folderData = folderSnapshot.val();
      if (folderData.userId !== user.uid) {
        throw new Error('Unauthorized to delete this folder');
      }

      // Delete all notes in the folder
      if (folderData.noteIds && folderData.noteIds.length > 0) {
        try {
          const noteDeletions = folderData.noteIds.map((noteId: string) =>
            remove(ref(db, `notes/${noteId}`))
          );

          // Wait for all notes to be deleted
          await Promise.all(noteDeletions);

          toast.success(`Deleted ${folderData.noteIds.length} note(s) from folder`);
        } catch (error) {
          console.error('Error deleting notes from folder:', error);
          throw new Error('Failed to delete notes in the folder');
        }
      }

      // Get user's current folders
      const userSnapshot = await get(userRef);
      if (!userSnapshot.exists()) {
        throw new Error('User data not found');
      }

      const userData = userSnapshot.val();
      let userFolderIds: string[] = [];

      if (Array.isArray(userData.folders)) {
        userFolderIds = userData.folders.filter((fid: string) => fid !== id);
      } else if (userData.folders && typeof userData.folders === 'object') {
        userFolderIds = Object.keys(userData.folders).filter((fid: string) => fid !== id);
      }

      // Update user's folders and delete the folder in a single transaction
      const updates: Record<string, any> = {
        [`users/${user.uid}/folders`]: userFolderIds,
        [`folders/${id}`]: null
      };

      await update(ref(db), updates);

      // Show success toast
      toast.success(`"${folderData.name || 'Folder'}" deleted successfully`);

      // Update local state optimistically
      if (isMounted.current) {
        setFolders(prevFolders =>
          prevFolders.filter(folder => folder.id !== id)
        );
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  };

  const refreshFolders = useCallback(() => {
    if (!user) {
      setFolders([]);
      setIsLoading(false);
      return;
    }

    const userRef = ref(db, `users/${user.uid}`);
    get(userRef).then((snapshot) => {
      if (!isMounted.current) return;

      if (snapshot.exists()) {
        const userData = snapshot.val();
        let folderIds: string[] = [];

        if (Array.isArray(userData.folders)) {
          folderIds = userData.folders.filter(Boolean);
        } else if (userData.folders && typeof userData.folders === 'object') {
          folderIds = Object.keys(userData.folders).filter(Boolean);
        }

        if (folderIds.length > 0) {
          updateFoldersList(folderIds);
        } else {
          setFolders([]);
          setIsLoading(false);
        }
      } else {
        setFolders([]);
        setIsLoading(false);
      }
    }).catch(error => {
      console.error('Error refreshing folders:', error);
      if (isMounted.current) {
        setError('Failed to refresh folders');
        setIsLoading(false);
      }
    });
  }, [db, user, updateFoldersList]);

  useEffect(() => {
  }, [folders]);

  return {
    folders,
    loading: isLoading,
    currentFolder,
    createFolder,
    deleteFolder,
    error
  };
};
