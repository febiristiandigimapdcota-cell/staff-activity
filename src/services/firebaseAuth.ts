import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Declare Google Identity Services on window
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
              expires_in?: number;
            }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.setCustomParameters({
  prompt: 'select_account'
});

const TOKEN_STORAGE_KEY = 'staff_activity_drive_token';
const EMAIL_STORAGE_KEY = 'staff_activity_drive_email';

let isSigningIn = false;
let cachedAccessToken: string | null = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
let customUserEmail: string | null = typeof window !== 'undefined' ? localStorage.getItem(EMAIL_STORAGE_KEY) : null;

export const initAuth = (
  onAuthSuccess?: (user: User | { email: string; displayName?: string }, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (cachedAccessToken && customUserEmail && onAuthSuccess) {
    onAuthSuccess({ email: customUserEmail, displayName: customUserEmail.split('@')[0] }, cachedAccessToken);
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (customUserEmail && cachedAccessToken) {
      if (onAuthSuccess) {
        onAuthSuccess({ email: customUserEmail, displayName: customUserEmail.split('@')[0] }, cachedAccessToken);
      }
    } else {
      if (!cachedAccessToken && onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Hybrid Google Sign-In:
 * 1. Tries Firebase Auth popup first.
 * 2. If blocked or unauthorized domain occurs in iframe, seamlessly falls back to Google Identity Services Token Client.
 */
export const googleSignIn = async (): Promise<{
  user: { email: string | null; displayName: string | null };
  accessToken: string;
} | null> => {
  isSigningIn = true;

  // Attempt 1: Firebase Auth Popup
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
      localStorage.setItem(TOKEN_STORAGE_KEY, credential.accessToken);
      if (result.user.email) {
        customUserEmail = result.user.email;
        localStorage.setItem(EMAIL_STORAGE_KEY, result.user.email);
      }
      return {
        user: { email: result.user.email, displayName: result.user.displayName },
        accessToken: cachedAccessToken
      };
    }
  } catch (firebaseErr: unknown) {
    const errCode = (firebaseErr as { code?: string })?.code || '';
    console.warn('Firebase signInWithPopup failed, trying Google Identity Services fallback...', errCode);

    // Wait briefly for GIS to load if necessary
    if (!window.google?.accounts?.oauth2 && typeof window !== 'undefined') {
      for (let i = 0; i < 20; i++) {
        if (window.google?.accounts?.oauth2) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // Attempt 2: Google Identity Services (GIS) Token Client
    if (window.google?.accounts?.oauth2 && firebaseConfig.oAuthClientId) {
      try {
        const gisToken = await new Promise<string>((resolve, reject) => {
          const client = window.google!.accounts.oauth2.initTokenClient({
            client_id: firebaseConfig.oAuthClientId,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
            callback: (res) => {
              if (res.error) {
                reject(new Error(res.error_description || res.error));
              } else if (res.access_token) {
                resolve(res.access_token);
              } else {
                reject(new Error('No access token returned from Google'));
              }
            }
          });
          client.requestAccessToken({ prompt: 'consent' });
        });

        cachedAccessToken = gisToken;
        localStorage.setItem(TOKEN_STORAGE_KEY, gisToken);

        // Fetch user profile info from Google API using the new token
        let userEmail = '';
        try {
          const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${gisToken}` }
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            if (userData.email) userEmail = userData.email;
          }
        } catch {
          // ignore
        }

        if (userEmail) {
          customUserEmail = userEmail;
          localStorage.setItem(EMAIL_STORAGE_KEY, userEmail);
        }

        return {
          user: { email: userEmail, displayName: userEmail.split('@')[0] },
          accessToken: gisToken
        };
      } catch (gisErr) {
        console.error('GIS token client error:', gisErr);
        throw new Error(
          'Google popup diblokir atau gagal dibuka. Pastikan pop-up diizinkan di peramban Anda, atau gunakan metode Webhook Apps Script di bawah.'
        );
      }
    } else {
      throw new Error(
        'Gagal menghubungkan Google Auth: ' + ((firebaseErr as Error)?.message || 'Pop-up tidak dapat dibuka.')
      );
    }
  } finally {
    isSigningIn = false;
  }

  return null;
};

export const getAccessToken = (): string | null => {
  if (!cachedAccessToken && typeof window !== 'undefined') {
    cachedAccessToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  }
  return cachedAccessToken;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

export const googleSignOut = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
  cachedAccessToken = null;
  customUserEmail = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(EMAIL_STORAGE_KEY);
  }
};
