'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { NoteWithId } from './useNotes';
import { Folder } from './useFolders';
import { FiPlus, FiSearch, FiFolder, FiChevronDown, FiChevronRight, FiMenu, FiX, FiDownload, FiEye } from 'react-icons/fi';
import { useFolders } from './useFolders';
import { useNotes } from './useNotes';
import { FiTrash2, FiEdit } from 'react-icons/fi';
import { NoteEditor } from './components/NoteEditor';
import { FolderList } from './components/FolderList';
import { toast } from 'react-hot-toast';
import { jsPDF } from 'jspdf';

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

// No need for explicit params interface as we're using client-side routing
interface NotesPageProps {
  // No need to define params and searchParams in the props interface
  // as we're using the useSearchParams hook for client-side routing
}

// Helper function to convert URL-friendly name to display name
const formatFolderDisplayName = (name: string) => {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function NotesPage() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const pathname = usePathname();

  // Get folder name from URL query parameter
  const folderNameFromUrl = searchParams.get('folder');

  // Use refs to store the latest values
  const foldersRef = useRef<Array<{ id: string; name: string }>>([]);
  const currentFolderIdRef = useRef<string | null>(null);

  // Get folders first
  const {
    folders,
    loading: foldersLoading,
    createFolder: createFolderOriginal,
    deleteFolder: deleteFolderOriginal,
  } = useFolders();

  // Handle folder creation with redirection
  const createFolder = useCallback(async (name: string) => {
    try {
      // Create the folder and get its ID
      const folderId = await createFolderOriginal(name);

      // Convert the provided name to URL-friendly format (don't wait for folders list to update)
      const folderUrlName = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Update URL to include the new folder
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.set('folder', folderUrlName);
      router.replace(`/notes?${newSearchParams.toString()}`);

      return folderId;
    } catch (error) {
      console.error('Error creating folder:', error);
      throw error;
    }
  }, [createFolderOriginal, router, searchParams]);

  // Handle folder deletion with URL update
  const handleDeleteFolder = useCallback(async (folderId: string) => {
    try {
      // Check if this is the current folder
      const isCurrentFolder = currentFolderIdRef.current === folderId;

      // Delete the folder
      await deleteFolderOriginal(folderId);

      // If it was the current folder, update the URL
      if (isCurrentFolder) {
        const newSearchParams = new URLSearchParams(searchParams.toString());
        newSearchParams.delete('folder');
        router.replace(`/notes?${newSearchParams.toString()}`);
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  }, [deleteFolderOriginal, router, searchParams]);

  // Update current folder ID when folderNameFromUrl or folders change
  useEffect(() => {
    if (folderNameFromUrl && folders) {
      const folder = folders.find(f => {
        const folderUrlName = f.name
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '');
        return folderUrlName === folderNameFromUrl;
      });
      currentFolderIdRef.current = folder?.id || null;
    } else {
      currentFolderIdRef.current = null;
    }
  }, [folderNameFromUrl, folders]);

  // Update folders ref when folders change
  useEffect(() => {
    if (folders) {
      foldersRef.current = folders;
    }
  }, [folders]);

  // Create a new URLSearchParams instance from the current search params
  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(name, value);
      return params.toString();
    },
    [searchParams]
  );

  // Get the current folder from URL
  const currentFolder = useMemo(() => {
    if (!folderNameFromUrl) return null;

    // Find folder by matching URL-friendly name
    const foundFolder = folders.find(folder => {
      const folderUrlName = folder.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

      return folderUrlName === folderNameFromUrl;
    });

    return foundFolder || null;
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

  // State for UI
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'longest' | 'shortest'>('newest');
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<{ id: string, title: string } | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

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
        return [...result].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      case 'oldest':
        return [...result].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
      case 'longest':
        return [...result].sort((a, b) => (b.contentLength || 0) - (a.contentLength || 0));
      case 'shortest':
        return [...result].sort((a, b) => (a.contentLength || 0) - (b.contentLength || 0));
      default:
        return result;
    }
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

  // Close PDF preview
  const closePdfPreview = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  // Define FolderEntry interface at the top level
  interface FolderEntry {
    id: string;
    name: string;
    notes: Array<{
      id: string;
      title?: string;
      content?: string;
      folderId?: string;
      updatedAt?: any;
    }>;
  }

  // Generate PDF with structured table of contents and notes
  const generatePdf = async (preview = false) => {
    // Initialize all variables at the start of the function
    let pdfBlob: Blob | null = null;
    const filename = 'notes-export.pdf';
    let doc: any = null;
    
    // Set loading state
    setIsPdfLoading(true);
    
    try {
      // Initialize PDF document
      const { jsPDF } = await import('jspdf');
      doc = new jsPDF('p', 'mm', 'a4');
      
      // Define layout constants
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const baseLineHeight = 7;
      const sectionSpacing = 10;
      let yPos = 60; // Start content below the header
      
      // Create a map of folders with their notes
      const notesByFolder: Record<string, Array<{
        id: string;
        title?: string;
        content?: string;
        folderId?: string;
        updatedAt?: any;
      }>> = {};
      
      // Initialize with existing folders
      folders.forEach((folder: { id: string }) => {
        notesByFolder[folder.id] = [];
      });
      
      // Add notes to their respective folders
      filteredNotes.forEach((note: { folderId?: string; id: string; title?: string; content?: string; updatedAt?: any }) => {
        if (note.folderId && !notesByFolder[note.folderId]) {
          // If folder doesn't exist in our folders list, skip it
          return;
        }
        const folderId = note.folderId || 'Uncategorized';
        if (!notesByFolder[folderId]) {
          notesByFolder[folderId] = [];
        }
        notesByFolder[folderId].push({
          id: note.id,
          title: note.title,
          content: note.content,
          folderId: note.folderId,
          updatedAt: note.updatedAt
        });
      });
      
      // Get all folder entries that exist in our folders list
      const folderEntries: FolderEntry[] = folders.map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        notes: notesByFolder[folder.id] || []
      }));
      
      // Add header with title, user email, and timestamp
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('NOTES EXPORT', 105, 20, { align: 'center' });
      
      // Add user email
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(`User: ${user?.email || 'Unknown'}`, 20, 35);
      
      // Add formatted date and time (dd/mm/yyyy, hh:mm:ss AM/PM)
      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-GB');
      const formattedTime = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      doc.text(`Generated on: ${formattedDate}, ${formattedTime}`, 20, 42);
      
      // Add a line separator
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 48, 190, 48);
      
      // Add TOC entries for all folders
      folderEntries.forEach((folder: any, folderIndex: number) => {
        const folderAnchorId = `folder_${folderIndex}`;
        
        // Add folder to TOC with number - bold and larger
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(`${folderIndex + 1}. ${folder.name}`, 20, yPos);
        yPos += 7;
        
        // Add notes under folder in TOC - normal weight and smaller
        doc.setFont('helvetica', 'normal');
        folder.notes.forEach((note: { title?: string }, index: number) => {
          const noteTitle = note.title || 'Untitled Note';
          const noteText = `  ${String.fromCharCode(97 + index)}) ${noteTitle}`;
          doc.text(noteText, 30, yPos);
          yPos += 5;
          
          // Add new page if needed
          if (yPos > 260) {
            doc.addPage();
            doc.text('Table of Contents (continued)', 105, 20, { align: 'center' });
            yPos = 30;
          }
        });
        
        yPos += 5;
      });
      
      // Add detailed notes on a new page
      doc.addPage();
      
      // Reset yPos for the new page
      yPos = 20;
      
      // Indentation settings (in mm)
      const folderIndent = 20;    // Folder indentation from left
      const noteIndent = 30;      // Note title indentation from left
      const contentIndent = 40;   // Content indentation from left
      const contentWidth = 160;   // Content width
      
      // Process each folder's notes in detail
      folderEntries.forEach((folder: any, folderIndex: number) => {
        // Add folder header with number - largest and bold
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(`${folderIndex + 1}. ${folder.name}`, folderIndent, yPos);
        yPos += 10;
        
        // Add notes under folder or message if no notes
        if (folder.notes.length === 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(12);
          doc.text('No notes exist for this folder', noteIndent, yPos);
          yPos += 8;
        } else {
          folder.notes.forEach((note: { title?: string; content?: string }, index: number) => {
            const noteTitle = note.title || 'Untitled Note';
            
            // Add note title - indented from folder
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.text(`${String.fromCharCode(97 + index)}) ${noteTitle}`, noteIndent, yPos);
            yPos += 7;
            
            // Add note content
            if (note.content) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(12);
              const splitText = doc.splitTextToSize(note.content, contentWidth);
              
              // Calculate how much space this note will take
              const noteHeight = splitText.length * 6; // Approximate line height
              
              // Check if we need a new page before adding this note
              if (yPos + noteHeight > 270) { // 270mm is roughly the height of A4 minus margins
                doc.addPage();
                yPos = 20; // Reset Y position for new page
                
                // Add folder and note title again if we're on a new page
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(16);
                doc.text(`${folderIndex + 1}. ${folder.name}`, folderIndent, yPos);
                yPos += 10;
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(14);
                doc.text(`${String.fromCharCode(97 + index)}) ${noteTitle}`, noteIndent, yPos);
                yPos += 7;
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(12);
              }
              
              // Add the note content
              const lines = [];
              for (let i = 0; i < splitText.length; i++) {
                // Check if we need a new page for the next line
                if (yPos > 270) {
                  doc.addPage();
                  yPos = 20;
                }
                doc.text(splitText[i], contentIndent, yPos);
                yPos += 6; // Line height
              }
            }
            
            yPos += 10; // Add space between notes
            
            // Add new page if we're too close to the bottom
            if (yPos > 270) {
              doc.addPage();
              yPos = 20;
            }
          });
        }
        
        yPos += 10; // Add extra space between folders
      });
      
      // Generate the PDF as a blob
      const generatedPdfBlob = doc.output('blob');
      pdfBlob = generatedPdfBlob; // Assign to outer scope variable
      
      if (preview) {
        // For preview, set the URL for the modal
        const pdfUrl = URL.createObjectURL(generatedPdfBlob);
        setPdfPreviewUrl(pdfUrl);
      } else {
        // For download, save the file
        doc.save('notes-export.pdf');
        toast.success('PDF exported successfully!');
      }
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsPdfLoading(false);
    }
  };

  // Handle download after preview
  const handleDownloadPdf = () => {
    if (!pdfPreviewUrl) return;
    
    try {
      // Create a link element
      const link = document.createElement('a');
      link.href = pdfPreviewUrl;
      link.download = 'notes-export.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('PDF download started!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF');
    }
  };

  // Handle saving a note
  const handleSaveNote = async (title: string, content: string, folderId: string | undefined = undefined) => {
    try {
      if (selectedNoteId) {
        // Update existing note
        await updateNote(selectedNoteId, { 
          title, 
          content, 
          folderId, // Pass undefined if not provided, which will be handled by the hook
          updatedAt: Date.now(),
          contentLength: content.length
        });
      } else {
        // Create new note - pass folderId as is (can be undefined)
        await createNote(title, content, folderId);
      }
      
      // Close the editor and reset state
      setIsEditorOpen(false);
      setSelectedNoteId(null);
      setCurrentNote(null);
      
      toast.success(selectedNoteId ? 'Note updated successfully!' : 'Note created successfully!');
    } catch (error) {
      console.error('Error saving note:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save note';
      toast.error(errorMessage);
    }
  };

  // Handle closing the PDF preview modal
  const handleClosePdfPreview = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  // Get the currently selected note from the hook
  const selectedNote = useMemo(
    () => selectedNoteId ? (notes || []).find((note: NoteWithId) => note.id === selectedNoteId) || null : currentNote,
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
        onDeleteFolder={handleDeleteFolder}
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
              {/* Sorting Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="longest">Longest First</option>
                <option value="shortest">Shortest First</option>
              </select>

              {/* Download PDF Button */}
              <button
                onClick={() => generatePdf(true)}
                disabled={isPdfLoading}
                className={`flex items-center gap-2 text-white bg-blue-600 border border-blue-600 px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isPdfLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                title="Export to PDF"
              >
                {isPdfLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <FiDownload className="h-4 w-4" />
                    <span>Export to PDF</span>
                  </>
                )}
              </button>

              {/* New Note Button */}
              <button
                onClick={handleNewNote}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <FiPlus className="h-4 w-4" />
                <span>New Note</span>
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
                                Last updated {new Date(note.updatedAt).toLocaleString('en-GB', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false
                                }).replace(',', '')}
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
                                    handleDeleteNote(note.id);
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
      {/* PDF Preview Modal - Google Drive Style */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 bg-gray-900/90 z-50 overflow-auto">
          {/* Close button */}
          <button
            onClick={closePdfPreview}
            className="fixed top-4 right-4 z-10 text-white p-2 rounded-full hover:bg-gray-700 transition-colors"
            aria-label="Close preview"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Centered PDF Container */}
          <div className="fixed inset-0 flex items-center justify-center p-8">
            <div className="w-full max-w-5xl h-full bg-gray-100 rounded overflow-hidden">
              {/* PDF Content - Takes full height */}
              <div className="w-full h-full">
                <iframe
                  src={`${pdfPreviewUrl}#toolbar=0&navpanes=1&view=FitH`}
                  className="w-full h-full border-0"
                  title="PDF Preview"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
