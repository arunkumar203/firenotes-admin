'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FiFolder, FiPlus, FiTrash2, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-hot-toast';

export interface Folder {
  id: string;
  name: string;
  userId: string;
  createdAt: number;
  noteIds?: string[];
  updatedAt?: number;
}

interface FolderListProps {
  folders: Folder[];
  currentFolderId: string | null;
  onFolderSelect: (folderId: string | null, folderName?: string) => void;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (folderId: string) => void;
}

export const FolderList = ({
  folders,
  currentFolderId,
  onFolderSelect,
  onCreateFolder,
  onDeleteFolder,
}: FolderListProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close the form when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isCreatingFolder && formRef.current && !formRef.current.contains(event.target as Node)) {
        setIsCreatingFolder(false);
        setNewFolderName('');
      }
    };

    if (isCreatingFolder) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCreatingFolder]);

  const handleCreateFolder = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const trimmedName = newFolderName.trim();
    if (!trimmedName || isSubmitting) return;

    try {
      setIsSubmitting(true);

      // Clear the input immediately for better UX
      const nameToCreate = trimmedName;
      setNewFolderName('');

      // Create the folder and wait for it to complete
      const newFolderId = await onCreateFolder(nameToCreate);

      // Close the form after successful creation
      setIsCreatingFolder(false);

      // Log success
      console.log('Folder created successfully with ID:', newFolderId);
      toast.success(`Folder "${nameToCreate}" created successfully`);
    } catch (error) {
      console.error('Error creating folder:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create folder';
      toast.error(errorMessage);
      // Keep the form open with the current input if there's an error
      setNewFolderName(trimmedName);
      // Re-throw the error to be handled by the parent component if needed
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFolderClick = async (folderId: string | null, folderName?: string, e?: React.MouseEvent) => {
    console.log('=== Folder Click Debug ===');
    console.log('1. Event:', e);
    console.log('2. Folder ID:', folderId);
    console.log('3. Folder Name:', folderName);
    
    e?.preventDefault();
    e?.stopPropagation();
    
    if (!folderId || !folderName) {
      console.log('No folder ID or name provided');
      return;
    }
    
    try {
      console.log('4. onFolderSelect exists:', !!onFolderSelect);
      
      if (onFolderSelect) {
        console.log('5. Calling onFolderSelect with:', { folderId, folderName });
        await onFolderSelect(folderId, folderName);
        console.log('7. onFolderSelect completed');
      } else {
        console.error('onFolderSelect is not defined');
      }
    } catch (error) {
      console.error('Error in handleFolderClick:', error);
    }
    
    console.log('=== End Debug ===');
  };

  const isActive = (folderId: string | null) => {
    const currentFolderParam = searchParams.get('folder');
    
    if (!folderId) {
      // Check if we're on the root notes page without any folder selected
      return pathname === '/notes' && !currentFolderParam;
    }
    
    // If no folder is selected in URL, check if this is the current folder
    if (!currentFolderParam) {
      return false;
    }
    
    // Get the folder from the folders list
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return false;
    
    // Create URL-friendly name for comparison (same as in page.tsx)
    const folderUrlName = folder.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    // Compare with the URL parameter
    return currentFolderParam === folderUrlName;
  };

  // Sort folders by creation date (newest first)
  const sortedFolders = [...folders].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="w-64 border-r border-gray-200 bg-white flex flex-col h-screen">
      <div className="flex flex-col h-full">
        {/* All Notes Section */}
        <div className="p-2 border-b border-gray-200 shrink-0">
          <Link
            href="/notes"
            className={`flex items-center px-4 py-3 text-sm rounded-md cursor-pointer transition-colors ${
              isActive(null)
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            style={{ cursor: 'pointer' }}
          >
            <span className="font-medium">All Notes</span>
          </Link>
        </div>

        {/* Folders Section */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-4 py-2 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Folders ({folders.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {folders.length === 0 && (
              <div className="px-4 py-2 text-sm text-gray-500">No folders found</div>
            )}

            {folders.length > 0 && (
              <div className="mb-2">
                {sortedFolders.map((folder) => {
                  const isActiveFolder = isActive(folder.id);
                  return (
                    <div
                      key={folder.id}
                      onClick={(e) => handleFolderClick(folder.id, folder.name, e)}
                      className={`group flex items-center justify-between w-full px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        isActiveFolder 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      style={{ cursor: 'pointer' }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleFolderClick(folder.id, folder.name, undefined)}
                    >
                      <div className="flex-1 flex items-center min-w-0">
                        <FiFolder className="mr-3 h-4 w-4 flex-shrink-0 text-gray-500" />
                        <span className="truncate">{folder.name}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 mr-2">
                          {folder.noteIds?.length || 0}
                        </span>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (window.confirm(`Delete folder "${folder.name}" and all its notes?`)) {
                              onDeleteFolder(folder.id);
                            }
                          }}
                          className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                          aria-label={`Delete folder ${folder.name}`}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-2 py-2 border-t border-gray-100 mt-2">
              {isCreatingFolder ? (
                <form
                  ref={formRef}
                  onSubmit={handleCreateFolder}
                  className="flex flex-col space-y-2 bg-white p-3 rounded-lg border border-gray-200 shadow-sm"
                >
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="New folder name"
                      className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingFolder(false);
                        setNewFolderName('');
                      }}
                      className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md border border-gray-300 disabled:opacity-50"
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 focus:outline-none whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Create folder"
                      disabled={isSubmitting || !newFolderName.trim()}
                    >
                      {isSubmitting ? 'Creating...' : 'Create Folder'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setIsCreatingFolder(true);
                    setNewFolderName('');
                  }}
                  className="w-full flex items-center justify-center px-4 py-2 border border-dashed border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-400 focus:outline-none"
                  aria-label="New folder"
                >
                  <FiPlus className="mr-2" size={16} />
                  New Folder
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
