import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ref,
  onValue,
  get,
  update,
  push,
  remove,
  getDatabase,
  query,
  orderByChild,
  equalTo,
  DataSnapshot,
  set,
  Unsubscribe
} from 'firebase/database';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'react-hot-toast';

export interface Note {
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  userId: string;
  contentLength: number;
}

export interface NoteWithId extends Note {
  id: string;
  folderId?: string; // Optional folder ID to associate note with a folder
}

interface UseNotesReturn {
  notes: NoteWithId[];
  loading: boolean;
  error: string | null;
  createNote: (title: string, content: string, folderId?: string | null) => Promise<string | null>;
  updateNote: (id: string, updates: Partial<Omit<Note, 'userId' | 'createdAt'> & { folderId?: string }>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  moveNoteToFolder: (noteId: string, targetFolderId: string | null) => Promise<void>;
  currentNote: NoteWithId | null;
  setCurrentNote: (note: NoteWithId | null) => void;
}

export const useNotes = (folderId?: string | null): UseNotesReturn => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<NoteWithId[]>([]);
  const [currentNote, setCurrentNote] = useState<NoteWithId | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const db = getDatabase();
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  // Cleanup function for real-time listeners
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const sortNotes = useCallback((notesToSort: NoteWithId[], sortMethod: string) => {
    return [...notesToSort].sort((a, b) => {
      switch (sortMethod) {
        case 'newest':
          return b.updatedAt - a.updatedAt;
        case 'oldest':
          return a.updatedAt - b.updatedAt;
        case 'longest':
          return (b.contentLength || 0) - (a.contentLength || 0);
        case 'shortest':
          return (a.contentLength || 0) - (b.contentLength || 0);
        default:
          return b.updatedAt - a.updatedAt;
      }
    });
  }, []);

  // Effect for setting up real-time listener
  useEffect(() => {
    if (!user) {
      setNotes([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    let folderUnsubscribe: (() => void) | null = null;

    const setupListeners = async () => {
      if (!isMounted) return;
      
      setLoading(true);
      setError(null);

      // Set up notes listener
      const notesRef = query(
        ref(db, 'notes'),
        orderByChild('userId'),
        equalTo(user.uid)
      );

      const handleNotesUpdate = async (snapshot: DataSnapshot) => {
        if (!isMounted) return;
        
        if (!snapshot.exists()) {
          setNotes([]);
          setLoading(false);
          return;
        }
        
        const notesData: NoteWithId[] = [];
        const seenIds = new Set<string>();
        
        // Process all notes
        snapshot.forEach((childSnapshot) => {
          const noteData = childSnapshot.val();
          const noteId = childSnapshot.key as string;
          
          if (noteData.userId === user.uid && !seenIds.has(noteId)) {
            seenIds.add(noteId);
            notesData.push({
              ...noteData,
              id: noteId
            });
          }
          return false;
        });

        // If we're viewing a specific folder, set up folder listener
        if (folderId && folderId !== 'all') {
          const folderRef = ref(db, `folders/${folderId}`);
          
          // Unsubscribe from previous folder listener if it exists
          if (folderUnsubscribe) {
            folderUnsubscribe();
            folderUnsubscribe = null;
          }
          
          // Set up folder listener
          folderUnsubscribe = onValue(folderRef, async (folderSnapshot) => {
            if (!isMounted) return;
            
            if (!folderSnapshot.exists() || folderSnapshot.val().userId !== user.uid) {
              setNotes([]);
              setLoading(false);
              return;
            }
            
            const folderData = folderSnapshot.val();
            if (Array.isArray(folderData?.noteIds)) {
              const filteredNotes = notesData.filter(note => 
                folderData.noteIds.includes(note.id)
              );
              setNotes(filteredNotes);
            } else {
              setNotes([]);
            }
            setLoading(false);
          }, (error) => {
            console.error('Error in folder listener:', error);
            if (isMounted) {
              setError('Failed to load folder data');
              setLoading(false);
            }
          });
        } else {
          // If no folder is selected, show all notes
          setNotes(notesData);
          setLoading(false);
        }
      };

      // Set up the notes listener
      const notesUnsubscribe = onValue(notesRef, handleNotesUpdate, (error) => {
        console.error('Error in notes listener:', error);
        if (isMounted) {
          setError('Failed to load notes');
          setLoading(false);
        }
      });

      // Cleanup function
      return () => {
        notesUnsubscribe();
        if (folderUnsubscribe) {
          folderUnsubscribe();
        }
      };
    };

    let cleanup: (() => void) | undefined;
    
    // Initialize listeners
    setupListeners().then(cb => {
      cleanup = cb || undefined;
    });

    // Cleanup function
    return () => {
      isMounted = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, [user, folderId, db]);

  const createNote = useCallback(
    async (title: string, content: string, folderId?: string | null): Promise<string | null> => {
      if (!user) {
        toast.error('User not authenticated.');
        throw new Error('User not authenticated');
      }
      
      if (!folderId) {
        throw new Error('No folder selected');
      }

      try {
        const now = Date.now();
        const notesRef = ref(db, 'notes');
        const newNoteRef = push(notesRef);
        const noteId = newNoteRef.key;
        
        if (!noteId) {
          throw new Error('Failed to generate note ID');
        }

        // Create the note data with folderId
        const newNote: Note & { folderId?: string } = {
          title: title.trim() || 'Untitled Note',
          content: content.trim(),
          createdAt: now,
          updatedAt: now,
          userId: user.uid,
          contentLength: content.trim().length,
          folderId: folderId || undefined
        };

        // Save the note to the database
        await set(newNoteRef, newNote);

        // If folder is specified, add the note to the folder
        if (folderId) {
          const folderRef = ref(db, `folders/${folderId}`);
          const folderSnapshot = await get(folderRef);
          
          if (folderSnapshot.exists() && folderSnapshot.val().userId === user.uid) {
            const folderData = folderSnapshot.val();
            const noteIds = Array.isArray(folderData.noteIds) 
              ? [...folderData.noteIds] 
              : [];
            
            if (!noteIds.includes(noteId)) {
              noteIds.push(noteId);
              await update(folderRef, { 
                noteIds,
                updatedAt: now
              });
            }
          }
        }

        // Don't update local state here - let the real-time listener handle it
        return noteId;
      } catch (e: any) {
        console.error('Error creating note:', e);
        toast.error(`Failed to create note: ${e.message}`);
        throw e; // Re-throw to let the caller handle the error
      }
    },
    [user, db]
  );

  const updateNote = useCallback(
    async (noteId: string, newValues: Partial<Omit<Note, 'userId' | 'createdAt'> & { folderId?: string }>) => {
      if (!user) {
        toast.error('User not authenticated.');
        throw new Error('User not authenticated');
      }

      try {
        const now = Date.now();
        const noteRef = ref(db, `notes/${noteId}`);
        const noteSnapshot = await get(noteRef);

        if (!noteSnapshot.exists() || noteSnapshot.val().userId !== user.uid) {
          toast.error('Note not found or unauthorized.');
          throw new Error('Note not found or unauthorized');
        }

        // Extract folderId from newValues if it exists
        const { folderId, ...noteUpdates } = newValues;
        
        // Prepare the update payload
        const noteUpdatePayload: Partial<Note> = { 
          ...noteUpdates,
          updatedAt: now 
        };
        
        if (newValues.content !== undefined) {
          noteUpdatePayload.contentLength = newValues.content.length;
        }

        // If folderId is being updated, we need to handle folder associations
        if ('folderId' in newValues) {
          // Get the current note data to check the previous folderId
          const currentNote = noteSnapshot.val();
          const previousFolderId = currentNote.folderId;
          
          // Only proceed if the folderId is actually changing
          if (folderId !== previousFolderId) {
            // Initialize updates object
            const updates: Record<string, any> = {};
            
            // Remove from old folder if it exists
            if (previousFolderId) {
              const oldFolderRef = ref(db, `folders/${previousFolderId}`);
              const oldFolderSnapshot = await get(oldFolderRef);
              
              if (oldFolderSnapshot.exists()) {
                const oldFolderData = oldFolderSnapshot.val();
                if (Array.isArray(oldFolderData.noteIds)) {
                  const updatedNoteIds = oldFolderData.noteIds.filter((id: string) => id !== noteId);
                  updates[`folders/${previousFolderId}/noteIds`] = updatedNoteIds;
                  updates[`folders/${previousFolderId}/updatedAt`] = now;
                }
              }
            }
            
            // Add to new folder if provided
            if (folderId) {
              const newFolderRef = ref(db, `folders/${folderId}`);
              const newFolderSnapshot = await get(newFolderRef);
              
              if (!newFolderSnapshot.exists() || newFolderSnapshot.val().userId !== user.uid) {
                throw new Error('Selected folder does not exist or you do not have permission');
              }
              
              const newFolderData = newFolderSnapshot.val();
              const currentNoteIds = Array.isArray(newFolderData.noteIds) 
                ? [...newFolderData.noteIds] 
                : [];
                
              if (!currentNoteIds.includes(noteId)) {
                currentNoteIds.push(noteId);
                updates[`folders/${folderId}/noteIds`] = currentNoteIds;
                updates[`folders/${folderId}/updatedAt`] = now;
              }
            }
            
            // Update the note's folderId
            updates[`notes/${noteId}/folderId`] = folderId || null;
            updates[`notes/${noteId}/updatedAt`] = now;
            
            // Execute all updates atomically
            await update(ref(db), updates);
          } else {
            // If folderId isn't changing, just update the note
            await update(noteRef, noteUpdatePayload);
          }
        } else {
          // If folderId isn't being updated, just update the note
          await update(noteRef, noteUpdatePayload);
        }
        
        // toast.success('Note updated!');
      } catch (e: any) {
        console.error('Error updating note:', e);
        toast.error(`Failed to update note: ${e.message}`);
        throw e;
      }
    },
    [user, db]
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!user) {
        toast.error('User not authenticated.');
        throw new Error('User not authenticated');
      }

      try {
        const noteRef = ref(db, `notes/${noteId}`);
        const noteSnapshot = await get(noteRef);

        if (!noteSnapshot.exists() || noteSnapshot.val().userId !== user.uid) {
          toast.error('Note not found or unauthorized.');
          throw new Error('Note not found or unauthorized');
        }

        // Get the note data before deleting
        const noteData = noteSnapshot.val();
        
        // Find all folders that might contain this note
        const foldersRef = ref(db, 'folders');
        const foldersSnapshot = await get(foldersRef);
        
        const updates: Record<string, any> = {};
        
        // If the note is in any folders, remove it from them
        if (foldersSnapshot.exists()) {
          foldersSnapshot.forEach((folderSnapshot) => {
            const folderData = folderSnapshot.val();
            if (folderData.userId === user.uid && Array.isArray(folderData.noteIds)) {
              const updatedNoteIds = folderData.noteIds.filter((id: string) => id !== noteId);
              if (updatedNoteIds.length !== folderData.noteIds.length) {
                updates[`folders/${folderSnapshot.key}/noteIds`] = updatedNoteIds;
                updates[`folders/${folderSnapshot.key}/updatedAt`] = Date.now();
              }
            }
          });
        }
        
        // Add the note deletion to the updates
        updates[`notes/${noteId}`] = null;
        
        // Execute all updates atomically
        await update(ref(db), updates);
        
        // Update local state if the deleted note is the current note
        if (currentNote?.id === noteId) {
          setCurrentNote(null);
        }
        
        toast.success('Note deleted!');
      } catch (e: any) {
        console.error('Error deleting note:', e);
        toast.error(`Failed to delete note: ${e.message}`);
        throw e;
      }
    },
    [user, db, currentNote]
  );

  const moveNoteToFolder = useCallback(
    async (noteId: string, targetFolderId: string | null) => {
      if (!user) {
        toast.error('User not authenticated.');
        throw new Error('User not authenticated');
      }

      try {
        const now = Date.now();
        const updates: Record<string, any> = {};
        
        // Get the current note to find its current folder
        const noteRef = ref(db, `notes/${noteId}`);
        const noteSnapshot = await get(noteRef);
        
        if (!noteSnapshot.exists() || noteSnapshot.val().userId !== user.uid) {
          toast.error('Note not found or unauthorized.');
          throw new Error('Note not found or unauthorized');
        }
        
        const currentFolderId = noteSnapshot.val().folderId;
        
        // If moving to a specific folder
        if (targetFolderId) {
          // Get target folder in parallel with other operations
          const [targetFolderSnapshot] = await Promise.all([
            get(ref(db, `folders/${targetFolderId}`)),
            // Get current folder data if it exists
            currentFolderId ? get(ref(db, `folders/${currentFolderId}`)) : Promise.resolve(null)
          ]);

          if (!targetFolderSnapshot.exists() || targetFolderSnapshot.val().userId !== user.uid) {
            throw new Error('Target folder not found or unauthorized');
          }
          
          // Add note to target folder
          const targetFolderData = targetFolderSnapshot.val();
          const targetNoteIds = Array.isArray(targetFolderData.noteIds) 
            ? [...targetFolderData.noteIds] 
            : [];

          if (!targetNoteIds.includes(noteId)) {
            updates[`folders/${targetFolderId}/noteIds`] = [...targetNoteIds, noteId];
            updates[`folders/${targetFolderId}/updatedAt`] = now;
          }
        }
        
        // Remove from current folder if it's different from target
        if (currentFolderId && currentFolderId !== targetFolderId) {
          const currentFolderRef = ref(db, `folders/${currentFolderId}`);
          const currentFolderSnapshot = await get(currentFolderRef);
          
          if (currentFolderSnapshot.exists()) {
            const currentFolderData = currentFolderSnapshot.val();
            if (Array.isArray(currentFolderData.noteIds)) {
              const updatedNoteIds = currentFolderData.noteIds.filter((id: string) => id !== noteId);
              updates[`folders/${currentFolderId}/noteIds`] = updatedNoteIds;
              updates[`folders/${currentFolderId}/updatedAt`] = now;
            }
          }
        }
        
        // Only update folderId if it's actually changing
        if (currentFolderId !== targetFolderId) {
          updates[`notes/${noteId}/folderId`] = targetFolderId;
          updates[`notes/${noteId}/updatedAt`] = now;
        }

        // Execute all updates in a single transaction if there are any changes
        if (Object.keys(updates).length > 0) {
          await update(ref(db), updates);
        }
        
        // Update local state immediately
        const updatedNote = { 
          ...noteSnapshot.val(), 
          id: noteId,
          folderId: targetFolderId || undefined,
          updatedAt: now 
        };
        
        setNotes(prevNotes => 
          prevNotes.map(note => note.id === noteId ? updatedNote : note)
        );
        
        if (currentNote?.id === noteId) {
          setCurrentNote(updatedNote);
        }
      } catch (e: any) {
        console.error('Error moving note:', e);
        toast.error(`Failed to move note: ${e.message}`);
        throw e;
      }
    },
    [user, db, folderId]
  );

  // Update current note when notes or folderId changes
  useEffect(() => {
    if (notes.length > 0 && !currentNote) {
      setCurrentNote(notes[0]);
    }
  }, [notes, currentNote]);

  return {
    notes: sortNotes(notes, 'updatedAt'),
    loading,
    error,
    createNote,
    updateNote,
    deleteNote,
    moveNoteToFolder,
    currentNote,
    setCurrentNote,
  };
};
