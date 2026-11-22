import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  signOut 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Workspace Scopes for Sheets and Drive
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.setCustomParameters({
  prompt: 'select_account'
});

export const GOOGLE_TOKEN_LIFETIME_MS = 55 * 60 * 1000;
export const GOOGLE_DRIVE_CONNECTION_LOST_EVENT = 'google-drive-connection-lost';

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedTokenTimestamp: number | null = null;
let currentUser: User | null = null;

const clearStoredGoogleToken = () => {
  cachedAccessToken = null;
  cachedTokenTimestamp = null;
  try {
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_time');
  } catch (_) {}
};

export const invalidateGoogleToken = (reason?: string) => {
  clearStoredGoogleToken();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(GOOGLE_DRIVE_CONNECTION_LOST_EVENT, {
        detail: {
          type: 'expired',
          reason: reason || 'Phiên làm việc Google Drive đã hết hạn hoặc bị thu hồi quyền truy cập.'
        }
      })
    );
  }
};

export const notifyGoogleNetworkError = (reason?: string) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(GOOGLE_DRIVE_CONNECTION_LOST_EVENT, {
        detail: {
          type: 'interrupted',
          reason: reason || 'Kết nối tới Google Drive bị gián đoạn hoặc mất mạng.'
        }
      })
    );
  }
};

export const getGoogleTokenRemainingMs = (): number => {
  try {
    const stored = cachedAccessToken || localStorage.getItem('google_access_token');
    const ts = cachedTokenTimestamp ?? Number(localStorage.getItem('google_token_time') || 0);
    if (!stored || !ts) return 0;
    const remaining = GOOGLE_TOKEN_LIFETIME_MS - (Date.now() - ts);
    return remaining > 0 ? remaining : 0;
  } catch (_) {
    return 0;
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    currentUser = user;
    if (user) {
      const storedToken = await getAccessToken();
      if (storedToken) {
        cachedAccessToken = storedToken;
        if (onAuthSuccess) onAuthSuccess(user, storedToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      clearStoredGoogleToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không lấy được Access Token từ Google Auth');
    }
    const now = Date.now();
    cachedAccessToken = credential.accessToken;
    cachedTokenTimestamp = now;
    currentUser = result.user;

    // Lưu trữ token vào localStorage để giữ phiên khi làm việc & đóng mở tab
    try {
      localStorage.setItem('google_access_token', credential.accessToken);
      localStorage.setItem('google_token_time', String(now));
      if (result.user.email) {
        localStorage.setItem('google_user_email', result.user.email);
      }
    } catch (e) {
      console.warn('Lỗi lưu token vào localStorage:', e);
    }

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  try {
    const stored = cachedAccessToken || localStorage.getItem('google_access_token');
    const storedTime = cachedTokenTimestamp ?? Number(localStorage.getItem('google_token_time') || 0);
    if (stored && storedTime) {
      const elapsed = Date.now() - storedTime;
      // Token Google thường có hạn 1 giờ (cho phép dùng trong 55 phút)
      if (elapsed < GOOGLE_TOKEN_LIFETIME_MS) {
        cachedAccessToken = stored;
        cachedTokenTimestamp = storedTime;
        return stored;
      } else {
        clearStoredGoogleToken();
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc token:', e);
  }
  return null;
};

export const hasValidGoogleToken = (): boolean => {
  return getGoogleTokenRemainingMs() > 0;
};

export const ensureGoogleAccessToken = async (): Promise<string> => {
  const token = await getAccessToken();
  if (token) return token;
  const res = await googleSignIn();
  if (!res?.accessToken) {
    throw new Error('Chưa cấp quyền Google. Vui lòng đăng nhập Google.');
  }
  return res.accessToken;
};

export const getCurrentUser = (): User | null => {
  return currentUser || auth.currentUser;
};

export const logout = async () => {
  await signOut(auth);
  clearStoredGoogleToken();
  currentUser = null;
  try {
    localStorage.removeItem('google_user_email');
  } catch (_) {}
};
