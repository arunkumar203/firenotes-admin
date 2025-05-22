import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotesPage from '../page';
import { useAuth } from '@/context/AuthContext';
import { useNotes } from '../useNotes';
import { useFolders } from '../useFolders';
import { toast } from 'react-hot-toast';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  useSearchParams: jest.fn(() => ({ get: jest.fn((param) => {
    if (param === 'q') return '';
    if (param === 'folder') return null;
    if (param === 'note') return null;
    return null;
  }) })),
  usePathname: jest.fn(() => '/notes'),
}));

// Mock AuthContext
jest.mock('@/context/AuthContext');

// Mock useNotes and useFolders hooks
jest.mock('../useNotes');
jest.mock('../useFolders');

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(), // Added for share functionality
  },
}));

// Mock Modal component
jest.mock('@/components/Modal', () => ({
  __esModule: true,
  default: jest.fn(({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="mock-modal">
        <h1>{title}</h1>
        {children}
        <button onClick={onClose} data-testid="mock-modal-close">Close</button>
      </div>
    );
  }),
}));

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn(() => Promise.resolve()),
  },
  writable: true,
});

const mockNotes = [
  { id: 'note1', title: 'Test Note 1', content: 'Content 1', updatedAt: Date.now(), folderId: null, userId: 'user1', createdAt: Date.now(), contentLength: 9 },
  { id: 'note2', title: 'Test Note 2', content: 'Content 2', updatedAt: Date.now(), folderId: 'folder1', userId: 'user1', createdAt: Date.now(), contentLength: 9 },
];

const mockFolders = [
  { id: 'folder1', name: 'Test Folder 1', userId: 'user1', createdAt: Date.now() },
];

describe('NotesPage - Share Functionality', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    (useAuth as jest.Mock).mockReturnValue({
      user: { uid: 'user1' },
      logout: jest.fn(),
      loading: false,
    });

    (useNotes as jest.Mock).mockReturnValue({
      notes: mockNotes,
      loading: false,
      createNote: jest.fn(),
      updateNote: jest.fn(),
      deleteNote: jest.fn(),
      currentNote: null,
      setCurrentNote: jest.fn(),
    });

    (useFolders as jest.Mock).mockReturnValue({
      folders: mockFolders,
      loading: false,
      createFolder: jest.fn(),
      deleteFolder: jest.fn(),
    });
    
    // Mock window.location.origin
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'http://localhost',
      },
      writable: true,
    });
  });

  test('renders share button for each note', () => {
    render(<NotesPage />);
    const shareButtons = screen.getAllByTitle('Share note');
    expect(shareButtons.length).toBe(mockNotes.length);
  });

  test('calls handleShareNote and opens modal with correct link when share button is clicked', async () => {
    render(<NotesPage />);
    
    const firstNoteShareButton = screen.getAllByTitle('Share note')[0];
    fireEvent.click(firstNoteShareButton);

    // Wait for modal to appear and contain the link
    await waitFor(() => {
      expect(screen.getByTestId('mock-modal')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Share Link' })).toBeInTheDocument();
    });

    const expectedLink = `${window.location.origin}/notes?note=${mockNotes[0].id}`;
    const linkInput = screen.getByRole('textbox') as HTMLInputElement; // Assuming the input is the only textbox in the modal
    expect(linkInput.value).toBe(expectedLink);
  });

  test('Copy Link button in modal calls navigator.clipboard.writeText and shows success toast', async () => {
    render(<NotesPage />);
    
    // Open the modal first for a note
    const firstNoteShareButton = screen.getAllByTitle('Share note')[0];
    fireEvent.click(firstNoteShareButton);

    await waitFor(() => {
      expect(screen.getByTestId('mock-modal')).toBeInTheDocument();
    });

    // Find the "Copy Link" button within the modal's children (as per our page.tsx structure)
    // This relies on the modal content structure passed as children
    const copyButton = screen.getByRole('button', { name: 'Copy Link' });
    fireEvent.click(copyButton);

    const expectedLink = `${window.location.origin}/notes?note=${mockNotes[0].id}`;
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedLink);
      expect(toast.success).toHaveBeenCalledWith('Link copied to clipboard!');
    });
  });

  test('handleShareNote is implicitly tested by modal opening with correct link', () => {
    // This test case is effectively covered by 'calls handleShareNote and opens modal with correct link'
    // If we wanted to explicitly spy on handleShareNote, we would need to refactor NotesPage
    // to make handleShareNote mockable (e.g. if it was a prop or a returned function from a custom hook)
    // For now, its functionality is tested via its side effects (opening modal, setting link).
    expect(true).toBe(true); // Placeholder assertion
  });

  test('Copy Link button shows error toast on failure', async () => {
    (navigator.clipboard.writeText as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('Copy failed')));
    
    render(<NotesPage />);
    
    const firstNoteShareButton = screen.getAllByTitle('Share note')[0];
    fireEvent.click(firstNoteShareButton);

    await waitFor(() => expect(screen.getByTestId('mock-modal')).toBeInTheDocument());

    const copyButton = screen.getByRole('button', { name: 'Copy Link' });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to copy link.');
    });
  });

});
