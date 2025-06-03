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

  // Close PDF preview
  const closePdfPreview = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  // Generate PDF with structured table of contents and notes
  const generatePdf = async (preview = false) => {
    setIsPdfLoading(true);
    let pdfBlob: Blob | null = null;
    const filename = 'notes-export.pdf';

    try {
      // Dynamically import jsPDF
      const { jsPDF } = await import('jspdf');

      // Create a new PDF document
      const doc = new jsPDF();
      
      // Add a title to the PDF
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('Notes Export', 20, 20);
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');

      // Define types for our folder entries
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

      // Create a map of folders with their notes
      const notesByFolder: Record<string, Array<{
        id: string;
        title?: string;
        content?: string;
        folderId?: string;
        updatedAt?: any;
      }>> = {};

      // Initialize with existing folders
      folders.forEach(folder => {
        notesByFolder[folder.id] = [];
      });

      // Add notes to their respective folders
      filteredNotes.forEach((note) => {
        if (note.folderId && !notesByFolder[note.folderId]) {
          // If folder doesn't exist in our folders list, skip it
          return;
        }
        const folderId = note.folderId || 'Uncategorized';
        if (!notesByFolder[folderId]) {
          notesByFolder[folderId] = [];
        }
        notesByFolder[folderId].push(note);
      });

      // Get all folder entries that exist in our folders list
      const folderEntries: FolderEntry[] = folders.map(folder => ({
        id: folder.id,
        name: folder.name,
        notes: notesByFolder[folder.id] || []
      }));

      // Table of Contents on first page
      doc.setFontSize(20);
      doc.text('Table of Contents', 105, 20, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 30, { align: 'center' });

      let yPos = 40;

      // Add TOC entries for all folders
      folderEntries.forEach((folder: any, folderIndex: number) => {
        // Create a unique anchor for this folder
        const folderAnchor = `folder_${folderIndex}`;

        // Add folder to TOC with number - bold and larger
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        // Add folder text with link
        const folderText = `${folderIndex + 1}. ${folder.name}`;
        // Add text with link (jsPDF 3.0.1 uses 'link' option for clickable text)
        // @ts-ignore - The link option exists in jsPDF but not in the TypeScript types
        doc.text(folderText, 20, yPos, { link: `#folder_${folderIndex}` });
        yPos += 10;

        // Add notes under folder in TOC - normal weight and smaller
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        folder.notes.forEach((note: { title?: string }, index: number) => {
          const noteTitle = note.title || 'Untitled Note';
          const noteAnchor = `note_${folderIndex}_${index}`;
          // Add note text with link
          const noteText = `  ${String.fromCharCode(97 + index)}) ${noteTitle}`;
          // Add text with link (jsPDF 3.0.1 uses 'link' option for clickable text)
          // @ts-ignore - The link option exists in jsPDF but not in the TypeScript types
          doc.text(noteText, 30, yPos, { link: `#note_${folderIndex}_${index}` });
          yPos += 7;

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
      doc.setFontSize(16);
      doc.text('Notes Export', 105, 20, { align: 'center' });
      yPos = 40;

      // Indentation settings (in mm)
      const folderIndent = 20;    // Folder indentation from left
      const noteIndent = 30;      // Note title indentation from left
      const contentIndent = 40;   // Content indentation from left
      const contentWidth = 160;   // Content width

      // Add notes by folder with numbers
      folderEntries.forEach((folder: any, folderIndex: number) => {

        // Add folder header with number - largest and bold (with anchor)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        const folderAnchor = `folder_${folderIndex}`;
        // Add folder header with destination
        const folderHeader = `${folderIndex + 1}. ${folder.name}`;
        // Add text with destination (anchor) for this section
        // @ts-ignore - The destination option exists in jsPDF but not in the TypeScript types
        doc.text(folderHeader, folderIndent, yPos, { destination: `folder_${folderIndex}` });
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

            // Add note title - indented from folder (with anchor)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            const noteAnchor = `note_${folderIndex}_${index}`;
            doc.text(
              `${String.fromCharCode(97 + index)}) ${noteTitle}`,
              noteIndent,
              yPos
            );
            yPos += 8;

            // Add note content - indented from title
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            const content = note.content || 'No content';
            const splitText = doc.splitTextToSize(content, contentWidth);

            // Page settings - maximized for content
            const lineHeight = 5.5;         // Compact line height
            const pageHeight = 297;         // A4 height in mm (210mm x 297mm)
            const marginTop = 15;           // Top margin in mm
            const marginBottom = 10;         // Bottom margin in mm

            // Process each line of text
            let remainingText = [...splitText];

            while (remainingText.length > 0) {
              // Calculate available space more precisely
              const availableSpace = pageHeight - yPos - marginBottom;
              const linesThatFit = Math.max(1, Math.floor(availableSpace / lineHeight));

              // If we can't fit any lines, start a new page
              if (linesThatFit <= 0) {
                doc.addPage('a4', 'portrait');
                yPos = marginTop;
                continue;
              }

              // Take only the lines that fit on current page
              const linesForThisPage = remainingText.splice(0, linesThatFit);

              // Add the lines to the current page with proper indentation
              doc.text(linesForThisPage, contentIndent, yPos, { maxWidth: contentWidth });
              yPos += linesForThisPage.length * lineHeight + 1;  // Minimal space between paragraphs

              // Only add new page if we can't fit the next line
              if (remainingText.length > 0 && yPos + lineHeight > pageHeight - marginBottom) {
                doc.addPage('a4', 'portrait');
                yPos = marginTop;
              }
            }
          });
        }

        yPos += 5;
      });

      // Generate the PDF as a blob
      const pdfBlob = doc.output('blob');

      if (preview) {
        // For preview, set the URL for the modal
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPdfPreviewUrl(pdfUrl);
      } else {
        // For download, save the file
        doc.save('notes-export.pdf');
        toast.success('PDF exported successfully!');
      }
    } catch (error) {
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
      
      // Set the href to the blob URL
      link.href = pdfPreviewUrl;
      
      // Force the download attribute with the desired filename
      link.setAttribute('download', 'notes-export.pdf');
      
      // Append to body, click and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('PDF download started!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF');
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
      } else {
        // Create new note with the selected folder
        await createNote(title, content, folderId || null);
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
  const selectedNote = useMemo(
    () => selectedNoteId ? notes.find(note => note.id === selectedNoteId) || null : currentNote,
    [selectedNoteId, currentNote, notes]
  );

  // ...

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
