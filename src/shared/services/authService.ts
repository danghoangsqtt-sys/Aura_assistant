/**
 * Auth Service — Handles authentication for both WebApp and Electron
 *
 * WebApp: Email/Password registration → Admin approval → Login
 * Electron: Google OAuth via CLIProxyAPI → Auto-auth (handled separately)
 *
 * Uses Appwrite Auth + users_metadata collection for approval tracking.
 */
import { ID, Query, Models } from 'appwrite';
import { account, databases, DB_ID, COLLECTION_USERS } from './appwriteConfig';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  isApproved: boolean;
  authProvider: 'email' | 'google';
  createdAt: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
}

class AuthService {
  private cachedUser: UserProfile | null = null;

  /**
   * Register new user (WebApp — email/password)
   */
  async register(email: string, password: string, displayName: string): Promise<UserProfile> {
    try {
      // 1. Create Appwrite Auth account
      const authUser = await account.create(ID.unique(), email, password, displayName);

      // 2. Auto-login sau khi đăng ký (dọn session cũ trước)
      try {
        await account.deleteSession('current');
      } catch {
        // Bỏ qua nếu không có session
      }
      await account.createEmailPasswordSession(email, password);

      // 3. Create metadata document in users_metadata collection
      // New users start as NOT approved — admin must activate
      const metadata = await databases.createDocument(DB_ID, COLLECTION_USERS, ID.unique(), {
        user_id: authUser.$id,
        display_name: displayName,
        email: email,
        is_activated: false,
        role: 'user',
      });

      const profile: UserProfile = {
        uid: authUser.$id,
        email: authUser.email,
        displayName: displayName,
        role: 'user',
        isApproved: false,
        authProvider: 'email',
        createdAt: metadata.$createdAt,
      };

      this.cachedUser = profile;
      return profile;
    } catch (error: any) {
      console.error('[AuthService] Register error:', error);
      if (error.code === 409) {
        throw new Error('Email đã được đăng ký. Vui lòng đăng nhập.');
      }
      throw new Error(error.message || 'Lỗi đăng ký tài khoản.');
    }
  }

  /**
   * Login (WebApp — email/password)
   */
  async login(email: string, password: string): Promise<UserProfile> {
    try {
      // 1. Dọn dẹp session cũ nếu có (tránh lỗi "user_session_already_exists" ở lần đăng nhập thứ 2)
      try {
        await account.deleteSession('current');
      } catch {
        // Không có session nào đang hoạt động, bỏ qua
      }

      // 2. Create session
      await account.createEmailPasswordSession(email, password);

      // 2. Get current user
      const authUser = await account.get();

      // 3. Get metadata from collection
      const profile = await this.fetchUserProfile(authUser);
      if (!profile) {
        throw new Error('Không tìm thấy hồ sơ người dùng. Liên hệ admin.');
      }

      this.cachedUser = profile;
      return profile;
    } catch (error: any) {
      console.error('[AuthService] Login error:', error);
      if (error.code === 401) {
        throw new Error('Email hoặc mật khẩu không đúng.');
      }
      throw new Error(error.message || 'Lỗi đăng nhập.');
    }
  }

  /**
   * Logout — destroy session
   */
  async logout(): Promise<void> {
    try {
      await account.deleteSession('current');
    } catch (e) {
      console.warn('[AuthService] Logout error (session may already be expired):', e);
    }
    this.cachedUser = null;
    localStorage.removeItem('aura_cliproxy_auth'); // Xóa cờ Proxy
  }

  /**
   * Get current user (check existing session)
   */
  async getCurrentUser(): Promise<UserProfile | null> {
    if (this.cachedUser) return this.cachedUser;

    try {
      const authUser = await account.get();
      const profile = await this.fetchUserProfile(authUser);
      this.cachedUser = profile;
      return profile;
    } catch {
      // No active session
      return null;
    }
  }

  /**
   * Fetch user profile (auth data + metadata from collection)
   */
  private async fetchUserProfile(authUser: Models.User<Models.Preferences>): Promise<UserProfile | null> {
    try {
      const docs = await databases.listDocuments(DB_ID, COLLECTION_USERS, [
        Query.equal('user_id', authUser.$id),
        Query.limit(1),
      ]);

      if (docs.documents.length === 0) {
        // User exists in Auth but not in metadata — might be an old account
        // Create metadata record
        await databases.createDocument(DB_ID, COLLECTION_USERS, ID.unique(), {
          user_id: authUser.$id,
          display_name: authUser.name || '',
          email: authUser.email || '',
          is_activated: false,
          role: 'user',
        });
        return {
          uid: authUser.$id,
          email: authUser.email,
          displayName: authUser.name || authUser.email,
          role: 'user',
          isApproved: false,
          authProvider: 'email',
          createdAt: authUser.$createdAt,
        };
      }

      const meta = docs.documents[0];
      
      // Auto-backfill missing fields for old accounts
      if (!meta.display_name && authUser.name) {
        try {
          await databases.updateDocument(DB_ID, COLLECTION_USERS, meta.$id, {
            display_name: authUser.name || authUser.email || '',
            email: authUser.email || ''
          });
        } catch (updateErr) {
          console.warn('[AuthService] Failed to auto-backfill metadata:', updateErr);
        }
      }

      return {
        uid: authUser.$id,
        email: authUser.email,
        displayName: authUser.name || authUser.email,
        role: (meta.role as 'user' | 'admin') || 'user',
        isApproved: meta.is_activated === true,
        authProvider: 'email',
        createdAt: meta.$createdAt,
      };
    } catch (e) {
      console.error('[AuthService] fetchUserProfile error:', e);
      return null;
    }
  }

  /**
   * Admin: List all users with their approval status
   */
  async listAllUsers(): Promise<UserProfile[]> {
    try {
      const docs = await databases.listDocuments(DB_ID, COLLECTION_USERS, [
        Query.limit(100),
        Query.orderDesc('$createdAt'),
      ]);

      return docs.documents.map((meta) => ({
        uid: meta.user_id as string,
        email: (meta as any).email || meta.user_id,
        displayName: (meta as any).displayName || meta.user_id,
        role: (meta.role as 'user' | 'admin') || 'user',
        isApproved: meta.is_activated === true,
        authProvider: 'email' as const,
        createdAt: meta.$createdAt,
      }));
    } catch (e) {
      console.error('[AuthService] listAllUsers error:', e);
      return [];
    }
  }

  /**
   * Admin: Approve / Reject / Change role
   */
  async updateUserStatus(documentId: string, updates: {
    is_activated?: boolean;
    role?: 'user' | 'admin';
  }): Promise<void> {
    await databases.updateDocument(DB_ID, COLLECTION_USERS, documentId, updates);
  }

  /**
   * Admin: Find document ID by user_id
   */
  async findUserDocument(userId: string): Promise<string | null> {
    try {
      const docs = await databases.listDocuments(DB_ID, COLLECTION_USERS, [
        Query.equal('user_id', userId),
        Query.limit(1),
      ]);
      return docs.documents.length > 0 ? docs.documents[0].$id : null;
    } catch {
      return null;
    }
  }

  /**
   * Clear cache (force-refresh on next getCurrentUser call)
   */
  clearCache() {
    this.cachedUser = null;
  }
}

export const authService = new AuthService();
