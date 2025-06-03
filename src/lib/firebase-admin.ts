import { getApps, initializeApp, getApp, cert, App, AppOptions } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const getFirebaseAdminConfig = (): AppOptions => {
  const firebaseAdminKey = process.env.FIREBASE_ADMIN_KEY;

  if (!firebaseAdminKey) {
    throw new Error('FIREBASE_ADMIN_KEY environment variable is not set');
  }

  try {
    const serviceAccount = JSON.parse(firebaseAdminKey);

    if (!serviceAccount.private_key || !serviceAccount.client_email || !serviceAccount.project_id) {
      throw new Error('Invalid Firebase Admin service account key');
    }

    return {
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
      }),
      databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
    };
  } catch (error) {
    console.error('Error parsing Firebase Admin config:', error);
    throw new Error('Failed to initialize Firebase Admin');
  }
};

let adminApp: App;

if (!getApps().length) {
  adminApp = initializeApp(getFirebaseAdminConfig());
} else {
  adminApp = getApp();
}

export { adminApp };
export const adminAuth = getAuth(adminApp);
