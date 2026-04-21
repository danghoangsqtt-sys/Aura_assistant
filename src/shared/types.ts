
export interface UserSettings {
  assistantName: string;
  live2dModelUrl?: string;
  userName: string;
  systemInstruction: string;
  fileContext: string;
  language: 'vi' | 'en';
  translationLangA: string; // e.g., 'vi'
  translationLangB: string; // e.g., 'en'
  apiKey?: string; // New field for custom API Key
  optimizeLatency?: boolean; // Feature to disable thinking for faster response
  optimizeForCoverage?: boolean; // Prioritize compatibility and smoother performance on weaker devices
  voiceSensitivity: number; // 0.1 to 5.0 (Default 1.5)
  userVoiceSample?: string; // Base64 PCM 16kHz Raw Audio
  appTheme?: 'dark' | 'light' | 'midnight' | 'cyberpunk';
  auraBackground?: string; // 'default' | 'office' | 'scifi' | 'anime_room' | custom URL
  avatarCharacter?: 'haru' | 'hiyori' | 'shizuku' | 'wanko' | 'custom'; // Character selector
  liveModel?: string; // Gemini Live model name
  screenVisionEnabled?: boolean; // Screen Vision: Aura can see your screen
  screenVisionIntervalSec?: number; // How often to capture (default 10s)
  cameraVisionEnabled?: boolean; // Camera Vision: Aura can see the real world via webcam
  cameraVisionIntervalSec?: number; // How often to capture webcam (default 8s)
  presentationFilePath?: string; // Đường dẫn file PPTX để Aura đọc tổng quan trước khi thuyết trình
  presentationKnowledge?: string; // [In-memory only, NOT persisted] — slide knowledge context injected at session start
}

export enum EyeState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  SPEAKING = 'SPEAKING',
  THINKING = 'THINKING',
  SLEEP = 'SLEEP'
}



export interface VideoState {
  isOpen: boolean;
  type: 'youtube' | 'zingmp3' | null;
  url: string;
  title: string;
}

export interface Reminder {
  label: string;
  time: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  originalText?: string; // Verification text (Source language) for Translator mode
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
}

export interface UserLocation {
  lat: number;
  lng: number;
  address?: string; // Optional display address
}

export type DocumentType = 'plan' | 'email' | 'content' | 'spreadsheet';

export interface GeneratedDocument {
  id: string;
  type: DocumentType;
  title: string;
  content: string;   // Markdown format
  metadata?: {
    to?: string;      // Email recipient
    from?: string;    // Email sender
    subject?: string; // Email subject
    columns?: string[];  // Spreadsheet column headers
  };
  createdAt: number;
}

export type MeetingNoteType = 'speech' | 'action' | 'decision' | 'question';

export interface MeetingNoteEntry {
  id: string;
  timestamp: number;
  speaker: string;       // "Speaker 1", "Giáo viên", or identified name
  content: string;
  type: MeetingNoteType;
  isPinned?: boolean;    // Ghim ghi chú quan trọng lên đầu
}

export type MeetingSessionTag = 'meeting' | 'lecture' | 'brainstorm' | 'interview' | 'other';

export interface MeetingSession {
  id: string;
  title?: string;
  tag?: MeetingSessionTag;
  startedAt: number;
  endedAt?: number;
  notes: MeetingNoteEntry[];
  isActive: boolean;
}

export type AppMode = 'assistant' | 'translator' | 'meeting' | 'presentation';
