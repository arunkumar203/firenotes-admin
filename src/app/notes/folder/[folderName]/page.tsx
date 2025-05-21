'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function FolderPage() {
  const router = useRouter();
  const params = useParams();
  const folderName = params.folderName as string;

  useEffect(() => {
    // Client-side redirect to the main notes page with the folder name as a query parameter
    if (folderName) {
      router.push(`/notes?folder=${encodeURIComponent(folderName)}`);
    }
  }, [folderName, router]);

  return null; // or a loading spinner if you prefer
}
