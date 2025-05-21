'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { FcGoogle } from 'react-icons/fc';
import { FaArrowRight, FaStickyNote } from 'react-icons/fa';

export default function Home() {
  const { loginWithGoogle, loading } = useAuth();
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    try {
      await loginWithGoogle();
      router.push('/notes');
    } catch (error) {
      console.error('Google sign in error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex justify-between items-center mb-4">
          <div></div> {/* Empty div to balance alignment */}
          <p className="text-sm text-gray-500">App created by R.Arun Kumar</p>
        </div>
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-100">
              <FaStickyNote className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
            Your Notes, Organized
          </h1>
          <p className="mt-6 max-w-lg mx-auto text-xl text-gray-500">
            Capture, organize, and share your thoughts with our simple and intuitive notes app.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleGoogleSignIn}
              className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 shadow-sm text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <FcGoogle className="w-5 h-5 mr-2" />
              Continue with Google
            </button>

            <Link
              href="/login"
              className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Get Started
              <FaArrowRight className="ml-2 -mr-1 w-4 h-4" />
            </Link>
          </div>

          <div className="mt-8 text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </Link>
          </div>
        </div>

        <div className="mt-16">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: 'Simple & Clean',
                description: 'Focus on your notes with our distraction-free interface.',
                icon: '✨',
              },
              {
                name: 'Access Anywhere',
                description: 'Your notes are synced across all your devices.',
                icon: '📱',
              },
              {
                name: 'Secure & Private',
                description: 'Your data is encrypted and stays private.',
                icon: '🔒',
              },
            ].map((feature) => (
              <div
                key={feature.name}
                className="pt-6 transform transition-transform duration-300 hover:scale-105 hover:shadow-lg"
              >
                <div className="flow-root bg-white rounded-lg px-6 pb-8 h-full">
                  <div className="-mt-6">
                    <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white text-xl mx-auto transform transition-transform duration-300 hover:scale-110">
                      {feature.icon}
                    </div>
                    <h3 className="mt-4 text-lg font-medium text-gray-900 text-center">
                      {feature.name}
                    </h3>
                    <p className="mt-2 text-base text-gray-500 text-center">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
