import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      console.error('No user ID provided');
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    console.log(`Attempting to delete user: ${userId}`);
    
    try {
      // First check if user exists
      try {
        await adminAuth.getUser(userId);
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          console.log(`User ${userId} not found in Auth, but continuing with success`);
          return NextResponse.json({ 
            success: true, 
            message: 'User not found in Auth (may have been already deleted)' 
          });
        }
        throw error;
      }
      
      // Delete the user from Firebase Auth
      await adminAuth.deleteUser(userId);
      console.log(`Successfully deleted user: ${userId} from Auth`);
      
      return NextResponse.json({ 
        success: true,
        message: 'User deleted successfully from Auth' 
      });
      
    } catch (error: any) {
      console.error('Error in delete operation:', error);
      
      // Handle specific Firebase Auth errors
      if (error.code === 'auth/user-not-found') {
        return NextResponse.json(
          { 
            success: true,
            message: 'User not found in Auth (may have been already deleted)' 
          },
          { status: 200 }
        );
      }
      
      throw error;
    }
    
  } catch (error: any) {
    console.error('Error in delete-user API:', error);
    const errorMessage = error.message || 'Failed to delete user';
    const statusCode = error.status || 500;
    
    return NextResponse.json(
      { 
        error: errorMessage,
        code: error.code || 'unknown_error'
      },
      { status: statusCode }
    );
  }
}
