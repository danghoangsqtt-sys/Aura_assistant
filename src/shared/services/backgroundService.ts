/**
 * Background Service — Upload, list, and delete custom backgrounds
 * Uses Appwrite Storage (bucket: user_backgrounds) + backgrounds collection
 */
import { ID, Query } from 'appwrite';
import { storage, databases, DB_ID, COLLECTION_BACKGROUNDS, BUCKET_BACKGROUNDS } from './appwriteConfig';

export interface CustomBackground {
  id: string;           // Document ID in backgrounds collection
  imageId: string;      // File ID in storage bucket
  imageUrl: string;     // Full preview URL
  active: boolean;      // Whether this is the currently active background
  createdAt: string;
}

class BackgroundService {
  /**
   * Get the public preview URL for a file in the backgrounds bucket
   */
  getFilePreviewUrl(fileId: string): string {
    const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
    const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '';
    return `${endpoint}/storage/buckets/${BUCKET_BACKGROUNDS}/files/${fileId}/preview?project=${projectId}&width=1920&quality=80`;
  }

  /**
   * Upload a new background image
   */
  async uploadBackground(file: File, userId: string): Promise<CustomBackground> {
    // 1. Upload file to storage
    const uploaded = await storage.createFile(
      BUCKET_BACKGROUNDS,
      ID.unique(),
      file,
    );

    // 2. Create metadata document in backgrounds collection
    const doc = await databases.createDocument(DB_ID, COLLECTION_BACKGROUNDS, ID.unique(), {
      user_id: userId,
      image_id: uploaded.$id,
      active: false,
    });

    return {
      id: doc.$id,
      imageId: uploaded.$id,
      imageUrl: this.getFilePreviewUrl(uploaded.$id),
      active: false,
      createdAt: doc.$createdAt,
    };
  }

  /**
   * List all custom backgrounds for a user
   */
  async listBackgrounds(userId: string): Promise<CustomBackground[]> {
    try {
      const docs = await databases.listDocuments(DB_ID, COLLECTION_BACKGROUNDS, [
        Query.equal('user_id', userId),
        Query.orderDesc('$createdAt'),
        Query.limit(50),
      ]);

      return docs.documents.map((doc) => ({
        id: doc.$id,
        imageId: doc.image_id as string,
        imageUrl: this.getFilePreviewUrl(doc.image_id as string),
        active: doc.active === true,
        createdAt: doc.$createdAt,
      }));
    } catch (e) {
      console.error('[BackgroundService] listBackgrounds error:', e);
      return [];
    }
  }

  /**
   * Set a background as active (deactivate others)
   */
  async setActiveBackground(userId: string, docId: string): Promise<void> {
    // Deactivate all current active backgrounds
    const current = await databases.listDocuments(DB_ID, COLLECTION_BACKGROUNDS, [
      Query.equal('user_id', userId),
      Query.equal('active', true),
      Query.limit(50),
    ]);
    for (const doc of current.documents) {
      await databases.updateDocument(DB_ID, COLLECTION_BACKGROUNDS, doc.$id, { active: false });
    }
    // Activate the selected one
    await databases.updateDocument(DB_ID, COLLECTION_BACKGROUNDS, docId, { active: true });
  }

  /**
   * Delete a custom background (file + metadata)
   */
  async deleteBackground(docId: string, imageId: string): Promise<void> {
    try {
      await storage.deleteFile(BUCKET_BACKGROUNDS, imageId);
    } catch (e) {
      console.warn('[BackgroundService] File already deleted or not found:', e);
    }
    await databases.deleteDocument(DB_ID, COLLECTION_BACKGROUNDS, docId);
  }
}

export const backgroundService = new BackgroundService();
