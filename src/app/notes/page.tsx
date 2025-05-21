'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { NoteWithId } from './useNotes';
import { FiPlus, FiSearch, FiFolder, FiChevronDown, FiChevronRight, FiMenu, FiX } from 'react-icons/fi';
import { useFolders } from './useFolders';
import { useNotes } from './useNotes';
import { FiTrash2, FiEdit } from 'react-icons/fi';
import { NoteEditor } from './components/NoteEditor';
import { FolderList } from './components/FolderList';
import { toast } from 'react-hot-toast';

// Highlight matching text in content
const HighlightText = ({ text, searchQuery }: { text: string; searchQuery: string }) => {
  if (!searchQuery.trim()) return <>{text}</>;
  
  const regex = new RegExp(`(${searchQuery})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

interface NotesPageParams {
  folderName?: string[];
}

interface NotesPageProps {
  params: NotesPageParams;
  searchParams: { [key: string]: string | string[] | undefined };
}

// Helper function to convert URL-friendly name to display name
const formatFolderDisplayName = (name: string) => {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function NotesPage({ params }: NotesPageProps) {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const pathname = usePathname();
  
  // Get folder name from URL query parameter
  const folderNameFromUrl = searchParams.get('folder');
  
  // Get folders first
  const {
    folders,
    loading: foldersLoading,
    createFolder,
    deleteFolder,
  } = useFolders(null);
  
  // Find the current folder by name from URL
  const currentFolder = useMemo(() => {
    if (!folderNameFromUrl) return null;
    
    // Find folder by matching URL-friendly name
    return folders.find(folder => {
      const folderUrlName = folder.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      return folderUrlName === folderNameFromUrl;
    }) || null;
  }, [folders, folderNameFromUrl]);
  
  // Update the URL if we have a current folder but no folder in URL
  useEffect(() => {
    if (currentFolder && !folderNameFromUrl) {
      const folderUrlName = currentFolder.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      router.replace(`/notes?folder=${folderUrlName}`);
    }
  }, [currentFolder, folderNameFromUrl, router]);

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'longest' | 'shortest'>('newest');





  // Get notes for the current folder
  const {
    notes,
    loading: notesLoading,
    createNote,
    updateNote,
    deleteNote,
    currentNote,
    setCurrentNote
  } = useNotes(currentFolder?.id || null);

  // Filter notes based on search query and current folder
  const filteredNotes = useMemo(() => {
    let result = [...notes];
    
    // Filter by folder if a folder is selected
    if (currentFolder) {
      result = result.filter(note => note.folderId === currentFolder.id);
    }
    
    // Filter by search query if provided
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(note => 
        note.title.toLowerCase().includes(query) || 
        note.content.toLowerCase().includes(query)
      );
    }
    
    // Sort notes based on the selected option
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        break;
      case 'oldest':
        result.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
        break;
      case 'longest':
        result.sort((a, b) => (b.contentLength || 0) - (a.contentLength || 0));
        break;
      case 'shortest':
        result.sort((a, b) => (a.contentLength || 0) - (b.contentLength || 0));
        break;
    }
    
    return result;
  }, [notes, currentFolder, searchQuery, sortBy]);

  // Handle folder selection
  const handleFolderSelect = async (folderId: string | null, folderName?: string) => {
    console.log('=== handleFolderSelect Debug ===');
    console.log('1. Folder ID:', folderId);
    console.log('2. Folder Name:', folderName);
    
    // Don't do anything if we're already on this folder
    const currentFolder = searchParams.get('folder');
    const urlFriendlyName = folderName 
      ? folderName
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '')
      : '';
    
    if ((!folderId && !currentFolder) || (folderId && currentFolder === urlFriendlyName)) {
      console.log('Already on this folder, skipping navigation');
      return;
    }
    
    setSelectedNoteId(null);
    setIsEditorOpen(false);
    
    try {
      if (folderId && folderName) {
        // Create URL-friendly folder name
        const newUrl = `/notes?folder=${urlFriendlyName}`;
        console.log('3. Generated URL:', newUrl);
        
        // Update URL with folder name as a query parameter
        console.log('4. Attempting to navigate...');
        await router.push(newUrl, { scroll: false });
        console.log('5. Navigation complete');
      } else {
        console.log('6. No folder selected, navigating to root /notes');
        // If no folder is selected, go to the root notes page
        await router.push('/notes', { scroll: false });
        console.log('7. Navigation to root complete');
      }
    } catch (error) {
      console.error('Navigation error:', error);
    } finally {
      console.log('=== End handleFolderSelect Debug ===');
    }
  };

  // Handle note selection
  const handleSelectNote = (noteId: string) => {
    setSelectedNoteId(noteId);
    setIsEditorOpen(true);
  };

  // Handle creating a new note
  const handleNewNote = () => {
    // Prevent multiple clicks
    if (isEditorOpen) return;

    // Create a new note with default values
    const newNote: NoteWithId = {
      id: '',
      title: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: user?.uid || '',
      contentLength: 0,
      folderId: currentFolder?.id || undefined
    };

    // Reset note state
    setSelectedNoteId(null);
    setCurrentNote(newNote);

    // Open the editor
    setIsEditorOpen(true);
  };

  // Handle note deletion
  const handleDeleteNote = async (noteId: string) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await deleteNote(noteId);
        // toast.success('Note deleted');
      } catch (error) {
        console.error('Error deleting note:', error);
        toast.error('Failed to delete note');
      }
    }
  };

  // Handle saving a note (create or update)
  const handleSaveNote = async (title: string, content: string, folderId: string | null) => {
    try {
      if (selectedNoteId) {
        // Update existing note with folderId
        await updateNote(selectedNoteId, {
          title,
          content,
          updatedAt: Date.now(),
          contentLength: content.length,
          folderId: folderId || undefined
        });
        // toast.success('Note updated');
      } else {
        // Create new note with the selected folder
        await createNote(title, content, folderId || null);
        // toast.success('Note created');
      }

      // Close the editor after successful save
      setIsEditorOpen(false);
      setSelectedNoteId(null);
      setCurrentNote(null);
    } catch (error) {
      console.error('Error saving note:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save note';
      toast.error(errorMessage);
      throw error; // Re-throw to let the editor handle the error state
    }
  };

  // Get the currently selected note from the hook
  const selectedNote = useMemo(() => 
    selectedNoteId ? notes.find(note => note.id === selectedNoteId) || null : currentNote,
    [selectedNoteId, currentNote, notes]
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <FolderList
        folders={folders}
        currentFolderId={currentFolder?.id || null}
        onFolderSelect={handleFolderSelect}
        onCreateFolder={createFolder}
        onDeleteFolder={deleteFolder}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-5 border-b border-gray-100 bg-white/95 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">
                {currentFolder ? currentFolder.name : 'All Notes'}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="longest">Longest first</option>
                <option value="shortest">Shortest first</option>
              </select>
              <button
                onClick={handleNewNote}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                New Note
              </button>
            </div>
          </div>
        </header>

        {/* Notes grid */}
        <main className="flex-1 overflow-y-auto">
          {notesLoading || foldersLoading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              <p className="text-gray-600 text-lg font-medium">Loading your notes...</p>
            </div>
          ) : (
            <div className="p-6">
              {filteredNotes.length === 0 ? (
                <div className="text-center py-16 px-4 max-w-md mx-auto">
                  <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl flex items-center justify-center mb-5 shadow-inner">
                    <FiFolder className="text-blue-400 text-3xl" />
                  </div>
                  <div className="text-center py-12 col-span-full">
                    <p className="text-gray-500">
                      {searchQuery ? 'No matching notes found' : 'No notes yet'}
                    </p>
                  </div>
                  <p className="text-gray-500 mb-6">
                    {currentFolder
                      ? 'Get started by creating a new note in this folder.'
                      : 'Create your first note to get started.'}
                  </p>
                  <button
                    onClick={handleNewNote}
                    className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-lg text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm transition-all duration-200 transform hover:-translate-y-0.5"
                  >
                    <FiPlus className="mr-2 h-4 w-4" />
                    Create Note
                  </button>
                </div>
              ) : (
                <>
                  {searchQuery && (
                    <div className="px-6 pt-2 pb-1">
                      <p className="text-sm text-gray-500">
                        Found {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'} matching "{searchQuery}"
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 p-6">
                  {filteredNotes
                    .sort((a, b) => {
                      switch (sortBy) {
                        case 'newest':
                          return b.createdAt - a.createdAt;
                        case 'oldest':
                          return a.createdAt - b.createdAt;
                        case 'longest':
                          return b.contentLength - a.contentLength;
                        case 'shortest':
                          return a.contentLength - b.contentLength;
                        default:
                          return 0;
                      }
                    })
                    .map((note: any) => {
                      // Find the folder name for this note
                      const folder = note.folderId
                        ? folders.find((f: any) => f.id === note.folderId)
                        : null;

                      return (
                      <div
                        key={note.id}
                        className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-200 flex flex-col h-full transform hover:-translate-y-0.5 hover:border-gray-200"
                      >
                        <div
                          className="p-5 flex-1 cursor-pointer transition-colors duration-200 hover:bg-gray-50/50 relative"
                          onClick={() => handleSelectNote(note.id)}
                        >
                          {/* Folder name badge - Moved to top right */}
                          {folder && (
                            <div className="absolute top-3 right-3">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                {folder.name}
                              </span>
                            </div>
                          )}

                          {/* Note title and content */}
                          <div className="pr-12">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors">
                              <HighlightText text={note.title} searchQuery={searchQuery} />
                            </h3>
                          </div>
                          <div className="text-gray-600 text-sm line-clamp-6 whitespace-pre-wrap break-words prose prose-sm max-w-none">
                            <HighlightText text={note.content} searchQuery={searchQuery} />
                          </div>
                        </div>

                        {/* Note footer with actions and timestamp */}
                        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between bg-gray-50/50">
                          <span className="text-xs text-gray-500 font-medium">
                            Last updated on {new Date(note.updatedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })} at {new Date(note.updatedAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                          <div className="flex space-x-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectNote(note.id);
                              }}
                              className="text-gray-400 hover:bg-gray-200 p-1.5 rounded-md transition-colors duration-200"
                              title="Edit note"
                            >
                              <FiEdit size={16} className="text-gray-500 hover:text-blue-600" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Are you sure you want to delete this note?')) {
                                  handleDeleteNote(note.id);
                                }
                              }}
                              className="text-gray-400 hover:bg-gray-200 p-1.5 rounded-md transition-colors duration-200"
                              title="Delete note"
                            >
                              <FiTrash2 size={16} className="text-gray-500 hover:text-red-600" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Note Editor */}
      {isEditorOpen && (
        <NoteEditor
          key={`note-editor-${selectedNoteId || 'new'}`}
          note={selectedNoteId ? selectedNote : currentNote}
          onSave={handleSaveNote}
          onDelete={selectedNoteId ? () => handleDeleteNote(selectedNoteId) : undefined}
          onClose={() => {
            setIsEditorOpen(false);
            setSelectedNoteId(null);
            setCurrentNote(null);
          }}
          folders={folders}
          folderId={currentFolder?.id || null}
        />
      )}
    </div>
  );
}
