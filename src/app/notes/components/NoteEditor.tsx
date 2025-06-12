'use client';

import { useState, useEffect, useMemo } from 'react';
import { FiSave, FiTrash2, FiX, FiCopy } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { useNotes } from '../useNotes';

import { NoteWithId } from '../useNotes';
import { Folder } from '../useFolders';

interface NoteEditorProps {
  note?: NoteWithId | null;
  onSave: (title: string, content: string, folderId: string) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
  folders: Folder[];
  folderId?: string | null;
}

// Helper to generate a unique key for the editor to force remount
const useEditorKey = (noteId?: string | null) => {
  const [key, setKey] = useState(() => `editor-${Date.now()}`);

  useEffect(() => {
    // Generate a new key when noteId changes to force remount
    setKey(`editor-${Date.now()}`);
  }, [noteId]);

  return key;
};

export const NoteEditor = ({
  note,
  onSave,
  onDelete,
  onClose,
  folders = [],
  folderId = null
}: NoteEditorProps) => {
  const editorKey = useEditorKey(note?.id);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const { moveNoteToFolder } = useNotes();

  // Check if form is valid (title and content not empty)
  const isFormValid = useMemo(() => {
    return title.trim() !== '' && content.trim() !== '';
  }, [title, content]);

  // Check if there are changes to save (including folder changes)
  const hasChanges = useMemo(() => {
    if (!note) return isFormValid;
    return (
      (title.trim() !== note.title || 
       content.trim() !== note.content ||
       (selectedFolderId && selectedFolderId !== note.folderId))
    ) && isFormValid;
  }, [note, title, content, selectedFolderId, isFormValid]);

  // Initialize form when the component mounts or when note/folders change
  useEffect(() => {
    // Skip if already initialized or no folders loaded yet
    if (isInitialized || folders.length === 0) return;

    // console.log('Initializing editor with note:', note);

    // If we don't have a note or the note has no ID, we're creating a new note
    if (!note?.id) {
      // console.log('Setting up new note form');
      setTitle('');
      setContent('');

      // Set default folder: first use folderId from props, then first folder, or empty string
      const defaultFolderId = folderId || (folders.length > 0 ? folders[0].id : '');
      setSelectedFolderId(defaultFolderId);
      setIsInitialized(true);
    } else {
      // console.log('Editing existing note:', note.id);
      // Existing note: populate with note data
      setTitle(note.title || '');
      setContent(note.content || '');

      // If the note has a folderId, select it (if the folder exists)
      if (note.folderId && folders.some(f => f.id === note.folderId)) {
        setSelectedFolderId(note.folderId);
      } else if (folders.length > 0) {
        // Default to the first folder if available
        setSelectedFolderId(folders[0].id);
      } else {
        setSelectedFolderId('');
      }
      setIsInitialized(true);
    }
  }, [note, folders, folderId, isInitialized]);

  // Handle folder selection change
  const handleFolderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFolderId(e.target.value);
  };

  // Handle saving a note
  const handleSave = async () => {
    // Validate inputs
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle) {
      toast.error('Please enter a title');
      return;
    }

    if (!trimmedContent) {
      toast.error('Please enter some content');
      return;
    }

    if (!selectedFolderId) {
      toast.error('Please select a folder');
      return;
    }

    // Check what changes are being made
    const isFolderChanged = note?.id && selectedFolderId !== note.folderId;
    const isContentChanged = note?.id && (
      trimmedTitle !== note.title || 
      trimmedContent !== note.content
    );

    // Prevent multiple saves
    if (isSaving) return;

    setIsSaving(true);
    try {
      if (isFolderChanged && note?.id) {
        // If only folder is being changed
        if (!isContentChanged) {
          await moveNoteToFolder(note.id, selectedFolderId);
          const fromFolder = folders.find(f => f.id === note.folderId)?.name || 'previous folder';
          const toFolder = folders.find(f => f.id === selectedFolderId)?.name || 'selected folder';
          toast.success(`Note moved from "${fromFolder}" to "${toFolder}"`);
          onClose();
          return;
        } else {
          // If both folder and content are being changed
          // First move the note to the new folder
          await moveNoteToFolder(note.id, selectedFolderId);
          const fromFolder = folders.find(f => f.id === note.folderId)?.name || 'previous folder';
          const toFolder = folders.find(f => f.id === selectedFolderId)?.name || 'selected folder';
          toast.success(`Note moved from "${fromFolder}" to "${toFolder}"`);
          
          // Then save the updated content
          await onSave(trimmedTitle, trimmedContent, selectedFolderId);
          onClose();
          return;
        }
      }
      
      // For all other cases (new note or just content change)
      await onSave(trimmedTitle, trimmedContent, selectedFolderId);
      
      // Reset form state after successful save for new notes
      if (!note?.id) {
        setTitle('');
        setContent('');
        setIsInitialized(false);
      }
    } catch (error) {
      console.error('Error saving note:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save note';
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle copy button click
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      
      // Select the content text
      const contentTextarea = document.getElementById('note-content') as HTMLTextAreaElement;
      if (contentTextarea) {
        contentTextarea.select();
      }
      
      toast.success('Note copied to clipboard');
    } catch (error) {
      console.error('Error copying note:', error);
      toast.error('Failed to copy note');
    }
  };

  // Handle delete button click
  const handleDelete = async () => {
    if (!onDelete) return;
    
    try {
      await onDelete();
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error('Failed to delete note');
    }
  };

  // Handle click outside the modal
  const handleOverlayClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on the overlay (not on the modal content)
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (isSaving) {
    return <div className="p-4">Saving note...</div>;
  }

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={handleOverlayClick}
        role="presentation"
      >
        <div
          className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">
              {note?.id ? 'Edit Note' : 'New Note'}
            </h2>
            <div className="flex space-x-2">
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 p-1 rounded-full hover:bg-gray-100"
                title="Close"
              >
                <FiX size={20} />
              </button>
            </div>
          </div>

          {/* Folder Selector */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="relative">
              <label htmlFor="folder-select" className="block text-sm font-medium text-gray-700 mb-1">
                Folder
              </label>
              <select
                id="folder-select"
                value={selectedFolderId || (folders.length > 0 ? folders[0].id : '')}
                onChange={handleFolderChange}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                disabled={folders.length === 0}
              >
                {folders.length === 0 ? (
                  <option value="">No folders available</option>
                ) : (
                  folders.map((folder) => (
                    <option key={`${folder.id}-${folder.name}`} value={folder.id}>
                      {folder.name}
                    </option>
                  ))
                )}
              </select>
              {folders.length === 0 && (
                <p className="mt-1 text-sm text-red-600">
                  Please create a folder first
                </p>
              )}
            </div>
          </div>

          {/* Note Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <label htmlFor="note-title" className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                type="text"
                id="note-title"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title"
              />
            </div>

            <div className="mb-4">
              <label htmlFor="note-content" className="block text-sm font-medium text-gray-700 mb-1">
                Content
              </label>
              <textarea
                id="note-content"
                className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your note here..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
            <div className="flex space-x-2">
              {note?.id && (
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!title && !content}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copy note content"
                >
                  <FiCopy className="mr-2" />
                  Copy
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={
                  !isFormValid ||
                  isSaving ||
                  !selectedFolderId ||
                  (Boolean(note?.id) && !hasChanges)
                }
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${!isFormValid ||
                  isSaving ||
                  !selectedFolderId ||
                  (Boolean(note?.id) && !hasChanges)
                  ? 'bg-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                  }`}
                title={note?.id && !hasChanges ? 'No changes to save' : undefined}
              >
                <FiSave className="mr-2" />
                {isSaving ? 'Saving...' : note?.id ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
