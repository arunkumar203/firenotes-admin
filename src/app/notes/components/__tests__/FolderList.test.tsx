import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FolderList, Folder } from '../FolderList'; // Adjust path as necessary
import { toast } from 'react-hot-toast';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  useSearchParams: jest.fn(() => ({ get: jest.fn((key) => {
    if (key === 'folder') return null; // Default mock behavior
    return null;
  }) })),
  usePathname: jest.fn(() => '/notes'), // Default mock behavior
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const mockFoldersData: Folder[] = [
  { id: 'folder1', name: 'Recipes', userId: 'user1', createdAt: Date.now(), noteIds: ['note1', 'note2'] },
  { id: 'folder2', name: 'Work Docs', userId: 'user1', createdAt: Date.now(), noteIds: ['note3'] },
  { id: 'folder3', name: 'Travel Plans', userId: 'user1', createdAt: Date.now() }, // Folder with no notes
];

describe('FolderList - Share Functionality', () => {
  let mockOnShareFolder: jest.Mock;
  let mockOnFolderSelect: jest.Mock;
  let mockOnCreateFolder: jest.Mock;
  let mockOnDeleteFolder: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnShareFolder = jest.fn();
    mockOnFolderSelect = jest.fn();
    mockOnCreateFolder = jest.fn();
    mockOnDeleteFolder = jest.fn();
  });

  const renderFolderList = (folders: Folder[] = mockFoldersData, currentFolderId: string | null = null) => {
    return render(
      <FolderList
        folders={folders}
        currentFolderId={currentFolderId}
        onFolderSelect={mockOnFolderSelect}
        onCreateFolder={mockOnCreateFolder}
        onDeleteFolder={mockOnDeleteFolder}
        onShareFolder={mockOnShareFolder}
      />
    );
  };

  test('renders share button for each folder', () => {
    renderFolderList();
    const shareButtons = screen.getAllByTitle(/Share folder/); // Regex to match "Share folder <folder_name>"
    expect(shareButtons.length).toBe(mockFoldersData.length);
  });

  test('calls onShareFolder with correct folderId and name when share button is clicked', () => {
    renderFolderList();
    
    const firstFolder = mockFoldersData[0];
    const firstFolderShareButton = screen.getByTitle(`Share folder ${firstFolder.name}`);
    fireEvent.click(firstFolderShareButton);

    expect(mockOnShareFolder).toHaveBeenCalledTimes(1);
    expect(mockOnShareFolder).toHaveBeenCalledWith(firstFolder.id, firstFolder.name);

    const secondFolder = mockFoldersData[1];
    const secondFolderShareButton = screen.getByTitle(`Share folder ${secondFolder.name}`);
    fireEvent.click(secondFolderShareButton);

    expect(mockOnShareFolder).toHaveBeenCalledTimes(2);
    expect(mockOnShareFolder).toHaveBeenCalledWith(secondFolder.id, secondFolder.name);
  });

  test('share button is not rendered if onShareFolder is not provided (optional)', () => {
    // This test depends on how you want the component to behave.
    // If the share button should always be there and simply do nothing or log a warning if onShareFolder is missing,
    // then this test would be different.
    // The current implementation of FolderList *always* renders the button and its handleShareFolderClick
    // function has a console.warn if onShareFolder is missing.
    // So, the button will always be rendered. Let's test that it calls the internal handler which logs a warning.
    
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    render(
      <FolderList
        folders={mockFoldersData}
        currentFolderId={null}
        onFolderSelect={mockOnFolderSelect}
        onCreateFolder={mockOnCreateFolder}
        onDeleteFolder={mockOnDeleteFolder}
        onShareFolder={undefined as any} // Simulate prop not being passed
      />
    );

    const firstFolder = mockFoldersData[0];
    const firstFolderShareButton = screen.getByTitle(`Share folder ${firstFolder.name}`);
    fireEvent.click(firstFolderShareButton);

    expect(mockOnShareFolder).not.toHaveBeenCalled(); // onShareFolder is undefined
    expect(consoleWarnSpy).toHaveBeenCalledWith('onShareFolder prop not provided to FolderList');
    expect(toast.error).toHaveBeenCalledWith('Share functionality is currently unavailable.');
    
    consoleWarnSpy.mockRestore();
  });

  test('share buttons are correctly associated with their respective folders', () => {
    renderFolderList();
    mockFoldersData.forEach(folder => {
      const shareButton = screen.getByTitle(`Share folder ${folder.name}`);
      expect(shareButton).toBeInTheDocument();
      // Test clicking each one individually
      fireEvent.click(shareButton);
      expect(mockOnShareFolder).toHaveBeenCalledWith(folder.id, folder.name);
    });
    expect(mockOnShareFolder).toHaveBeenCalledTimes(mockFoldersData.length);
  });

});
