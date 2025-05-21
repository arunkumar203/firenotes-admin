import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import { Toaster } from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Notes App',
  description: 'A simple notes application built with Next.js and Firebase',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <AuthProvider>
          <Toaster 
            position="top-center"
            toastOptions={{
              style: {
                background: '#fff',
                color: '#1a202c',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                borderRadius: '0.5rem',
                padding: '1rem 1.5rem',
                fontSize: '0.9375rem',
                fontWeight: 500,
                minWidth: '300px',
                textAlign: 'center',
              },
            }}
          />
          <div className="min-h-screen bg-gray-50">
            <Navbar />
            <main className="min-h-[calc(100vh-4rem)]">
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
