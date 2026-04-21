/**
 * MemoryService — Long-term Memory for Aura
 * Stores facts, preferences, and events across sessions.
 * Uses localStorage + Appwrite Cloud sync (Phase 6).
 */
import { ID, Query } from 'appwrite';
import { databases, DB_ID, COLLECTION_MEMORIES } from './appwriteConfig';

export interface Memory {
  id: string;
  category: 'fact' | 'preference' | 'event';
  content: string;
  importance: number; // 1-5
  createdAt: number;
  lastAccessedAt: number;
  cloudId?: string; // Appwrite document ID (if synced)
}

const MEMORY_KEY = 'aura_long_term_memory';
const MAX_MEMORIES = 100;
const SYNC_DEBOUNCE_MS = 5000; // 5s debounce for cloud sync

export class MemoryService {
  private memories: Memory[] = [];
  private currentUserId: string | null = null;
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;
  private isSyncing = false;

  constructor() {
    this.load();
  }

  /** Set the current user ID for cloud sync */
  setUserId(userId: string | null) {
    this.currentUserId = userId;
    if (userId) {
      console.log(`[MemoryService] User set: ${userId}, initiating cloud sync...`);
      this.loadFromCloud(userId).catch(e => console.warn('[MemoryService] Cloud load failed:', e));
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(MEMORY_KEY);
      this.memories = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(this.memories)) {
        throw new Error('Invalid memory format: expected array');
      }
    } catch (e) {
      console.warn('[MemoryService] Corrupt memory storage, resetting:', e);
      localStorage.removeItem(MEMORY_KEY);
      this.memories = [];
    }
  }

  private save() {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(this.memories));
    this.debouncedCloudSync();
  }

  /** Queue a cloud sync with debounce */
  private debouncedCloudSync() {
    if (!this.currentUserId) return;
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.syncToCloud(this.currentUserId!).catch(e => 
        console.warn('[MemoryService] Background cloud sync failed:', e)
      );
    }, SYNC_DEBOUNCE_MS);
  }

  addMemory(category: Memory['category'], content: string, importance: number = 3): Memory {
    // Avoid exact duplicates
    const existing = this.memories.find(m => m.content.toLowerCase() === content.toLowerCase());
    if (existing) {
      existing.lastAccessedAt = Date.now();
      existing.importance = Math.max(existing.importance, importance);
      this.save();
      return existing;
    }

    const memory: Memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category,
      content,
      importance,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    this.memories.push(memory);

    // Prune oldest low-importance memories if over limit
    if (this.memories.length > MAX_MEMORIES) {
      this.memories.sort((a, b) => {
        const scoreA = a.importance * 1000 + a.lastAccessedAt / 1e9;
        const scoreB = b.importance * 1000 + b.lastAccessedAt / 1e9;
        return scoreB - scoreA;
      });
      this.memories = this.memories.slice(0, MAX_MEMORIES);
    }

    this.save();
    return memory;
  }

  /**
   * Search memories by keyword matching (simple TF-IDF-like scoring)
   */
  searchMemories(query: string, limit: number = 5): Memory[] {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (queryWords.length === 0) return this.getRecentMemories(limit);

    const scored = this.memories.map(m => {
      const contentLower = m.content.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (contentLower.includes(word)) score += 1;
      }
      score *= m.importance;
      return { memory: m, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => {
        s.memory.lastAccessedAt = Date.now();
        return s.memory;
      });
  }

  getRecentMemories(limit: number = 10): Memory[] {
    return [...this.memories]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  getAllMemories(): Memory[] {
    return [...this.memories].sort((a, b) => b.createdAt - a.createdAt);
  }

  deleteMemory(id: string) {
    const memory = this.memories.find(m => m.id === id);
    this.memories = this.memories.filter(m => m.id !== id);
    this.save();

    // Also delete from cloud if synced
    if (memory?.cloudId && this.currentUserId) {
      databases.deleteDocument(DB_ID, COLLECTION_MEMORIES, memory.cloudId)
        .catch(e => console.warn('[MemoryService] Cloud delete failed:', e));
    }
  }

  clearAll() {
    this.memories = [];
    this.save();
  }

  /**
   * Generate a context block to inject into systemInstruction
   */
  getMemoryContext(limit: number = 15): string {
    const recent = this.getRecentMemories(limit);
    if (recent.length === 0) return '';

    const lines = recent.map(m => {
      const date = new Date(m.createdAt).toLocaleDateString('vi-VN');
      const icon = m.category === 'fact' ? '📌' : m.category === 'preference' ? '❤️' : '📅';
      return `${icon} [${date}] ${m.content}`;
    });

    return `\n\n===== LONG-TERM MEMORY (Aura ghi nhớ) =====\nIMPORTANT: These are facts Aura has learned about the user over time. Use them naturally in conversation to show you remember and care.\n${lines.join('\n')}`;
  }

  // ═══════════════════════════════════════════════════════════
  // CLOUD SYNC — Appwrite Integration (Phase 6)
  // ═══════════════════════════════════════════════════════════

  /**
   * Upload local memories to Appwrite cloud
   */
  async syncToCloud(userId: string): Promise<{ uploaded: number, errors: number }> {
    if (this.isSyncing) return { uploaded: 0, errors: 0 };
    this.isSyncing = true;

    let uploaded = 0;
    let errors = 0;

    try {
      // Get memories that don't have a cloudId yet
      const unsynced = this.memories.filter(m => !m.cloudId);

      for (const memory of unsynced) {
        try {
          const doc = await databases.createDocument(
            DB_ID,
            COLLECTION_MEMORIES,
            ID.unique(),
            {
              userId,
              category: memory.category,
              content: memory.content,
              importance: memory.importance,
              createdAt: memory.createdAt,
              lastAccessedAt: memory.lastAccessedAt,
            }
          );
          memory.cloudId = doc.$id;
          uploaded++;
        } catch (e: any) {
          // If collection doesn't exist, log once and stop
          if (e?.code === 404) {
            console.warn('[MemoryService] Collection user_memories not found. Cloud sync disabled until collection is created.');
            break;
          }
          errors++;
          console.warn(`[MemoryService] Failed to sync memory "${memory.id}":`, e?.message);
        }
      }

      if (uploaded > 0) {
        // Save updated cloudIds
        localStorage.setItem(MEMORY_KEY, JSON.stringify(this.memories));
        console.log(`[MemoryService] ☁️ Synced ${uploaded} memories to cloud (${errors} errors)`);
      }
    } catch (e) {
      console.warn('[MemoryService] syncToCloud error:', e);
    } finally {
      this.isSyncing = false;
    }

    return { uploaded, errors };
  }

  /**
   * Load memories from Appwrite cloud and merge with local
   */
  async loadFromCloud(userId: string): Promise<number> {
    try {
      const response = await databases.listDocuments(
        DB_ID,
        COLLECTION_MEMORIES,
        [
          Query.equal('userId', userId),
          Query.orderDesc('createdAt'),
          Query.limit(MAX_MEMORIES),
        ]
      );

      let merged = 0;
      for (const doc of response.documents) {
        // Skip if already in local (by content match)
        const existsLocally = this.memories.some(
          m => m.content.toLowerCase() === (doc.content || '').toLowerCase()
        );

        if (!existsLocally) {
          this.memories.push({
            id: `mem_cloud_${doc.$id}`,
            category: (doc.category as Memory['category']) || 'fact',
            content: doc.content || '',
            importance: doc.importance || 3,
            createdAt: doc.createdAt || Date.now(),
            lastAccessedAt: doc.lastAccessedAt || Date.now(),
            cloudId: doc.$id,
          });
          merged++;
        } else {
          // Update cloudId for existing memories
          const local = this.memories.find(
            m => m.content.toLowerCase() === (doc.content || '').toLowerCase()
          );
          if (local && !local.cloudId) {
            local.cloudId = doc.$id;
          }
        }
      }

      if (merged > 0) {
        localStorage.setItem(MEMORY_KEY, JSON.stringify(this.memories));
        console.log(`[MemoryService] ☁️ Merged ${merged} memories from cloud`);
      }

      // Sync any unsynced local memories back
      await this.syncToCloud(userId);

      return merged;
    } catch (e: any) {
      if (e?.code === 404) {
        console.warn('[MemoryService] Collection user_memories not found. Set up Appwrite first.');
      } else {
        console.warn('[MemoryService] loadFromCloud error:', e?.message);
      }
      return 0;
    }
  }
}

// Singleton instance
export const memoryService = new MemoryService();

