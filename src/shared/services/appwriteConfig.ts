/**
 * Appwrite Configuration for Aura Assistant
 * Project: Aura_NPC on SGP Cloud
 */
import { Client, Account, Databases, Storage } from 'appwrite';

const client = new Client();

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '';

if (!projectId) {
  console.warn('[Appwrite] Missing VITE_APPWRITE_PROJECT_ID in environment variables.');
}

client
  .setEndpoint(endpoint)
  .setProject(projectId);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// Database & Collection IDs
export const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'aura_db';
export const COLLECTION_USERS = import.meta.env.VITE_APPWRITE_COLLECTION_USERS || 'users_metadata';
export const COLLECTION_BACKGROUNDS = import.meta.env.VITE_APPWRITE_COLLECTION_BACKGROUNDS || 'backgrounds';
export const COLLECTION_MEMORIES = import.meta.env.VITE_APPWRITE_COLLECTION_MEMORIES || 'user_memories';
export const BUCKET_BACKGROUNDS = import.meta.env.VITE_APPWRITE_BUCKET_BACKGROUNDS || '';

export default client;
