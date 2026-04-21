/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPWRITE_ENDPOINT: string;
  readonly VITE_APPWRITE_PROJECT_ID: string;
  readonly VITE_APPWRITE_DATABASE_ID: string;
  readonly VITE_APPWRITE_COLLECTION_USERS: string;
  readonly VITE_APPWRITE_COLLECTION_BACKGROUNDS: string;
  readonly VITE_APPWRITE_BUCKET_BACKGROUNDS: string;
  readonly VITE_CLIPROXY_PORT: string;
  readonly VITE_CLIPROXY_MGMT_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
