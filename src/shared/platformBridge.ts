/**
 * Platform Bridge — Aura Assistant
 *
 * Abstract layer giữa Web và Electron.
 * - Trên Web: tất cả methods là no-op / fallback
 * - Trên Electron: proxy sang window.electronAPI (IPC)
 *
 * Không import file này trực tiếp — dùng singleton `platform` đã export sẵn.
 */

export interface IPlatformBridge {
  /** true nếu đang chạy trong Electron, false nếu là Web */
  readonly isElectron: boolean;

  /** Đóng/ẩn cửa sổ Electron */
  closeWindow(): void;

  /** Bắt đầu drag cửa sổ (native drag) */
  startDrag(pos: { x: number; y: number }): void;

  /** Cập nhật vị trí khi đang drag */
  doDrag(): void;

  /** Kết thúc drag */
  stopDrag(): void;

  /**
   * Resize cửa sổ Electron.
   * Trên Web: no-op
   */
  resizeWindow(width: number, height: number, options?: { anchorX?: 'left' | 'center' | 'right', savePositionForRestore?: boolean, restorePosition?: boolean }): void;

  /**
   * Chụp ảnh màn hình desktop (Electron Screen Vision).
   * opts.presentationMode = true để ưu tiên tìm cửa sổ PowerPoint/Slides
   * Trả về base64 JPEG hoặc null nếu thất bại / đang chạy Web.
   */
  captureScreen(opts?: { presentationMode?: boolean }): Promise<string | null>;

  /** Điều khiển trình chiếu */
  controlPresentation?(options: { action: string; slide_num?: number }): Promise<{ success: boolean; error?: string }>;

  /**
   * Mở URL trong trình duyệt mặc định của hệ thống.
   * Electron: shell.openExternal (IPC)
   * Web: window.open(url, '_blank')
   */
  openExternalUrl(url: string): void;

  /**
   * Đóng tab trình duyệt dựa theo từ khóa (Chỉ hỗ trợ Windows/Electron).
   */
  closeBrowserTabs(options: { matchKeywords?: string[], excludeKeywords?: string[], closeAll?: boolean }): Promise<{ success: boolean, handled: number, error?: string }>;

  /** Tìm kiếm file/folder trên ổ đĩa (Chỉ hỗ trợ Electron/Windows). */
  searchFiles(options: { query: string, scope?: string, file_type?: string, max_results?: number }): Promise<{ success: boolean, results: Array<{ name: string, path: string, type: string, size: number, modified: string }>, totalFound?: number, error?: string }>;

  /** Mở file/folder hoặc hiện trong Explorer (Chỉ hỗ trợ Electron). */
  openPath(options: { path: string, reveal_in_folder?: boolean }): Promise<{ success: boolean, action?: string, note?: string, error?: string }>;

  /** Đóng cửa sổ File Explorer (Chỉ hỗ trợ Electron/Windows). */
  closeFolderWindow(options: { path?: string, close_all?: boolean }): Promise<{ success: boolean, closed: number, error?: string }>;

  /** Lập lịch / nhắc nhở (Chỉ hỗ trợ Electron). */
  scheduleTask(options: { label: string, cronExpression?: string, delayMinutes?: number, repeat?: boolean }): Promise<{ success: boolean, task?: any, error?: string }>;

  /** Hủy một task đã lên lịch. */
  cancelTask(taskId: string): Promise<{ success: boolean, error?: string }>;

  /** Liệt kê tất cả tasks đang hoạt động. */
  listTasks(): Promise<{ success: boolean, tasks: any[], error?: string }>;

  /** Lắng nghe sự kiện cron trigger từ Electron. */
  onCronTriggered(callback: (data: { id: string, label: string, type: string, repeat: boolean }) => void): void;

  /** Plugin Engine — list loaded plugins */
  listPlugins(): Promise<{ success: boolean, plugins: any[], error?: string }>;
  /** Plugin Engine — execute a plugin by name */
  executePlugin(name: string, params: any): Promise<{ success: boolean, result?: any, error?: string }>;
  /** Plugin Engine — check if a plugin exists */
  hasPlugin(name: string): Promise<boolean>;

  /** Document Reader — read PDF/DOCX/TXT content */
  readDocument(options: { path: string }): Promise<{ success: boolean, text?: string, fileName?: string, format?: string, pageCount?: number, charCount?: number, truncated?: boolean, error?: string }>;

  /** Ollama — check if local LLM is available */
  ollamaStatus(): Promise<{ available: boolean, models: string[], error?: string }>;
  /** Ollama — generate text using local LLM */
  ollamaGenerate(options: { prompt: string, model?: string, system?: string, temperature?: number, maxTokens?: number }): Promise<{ success: boolean, text?: string, error?: string }>;
  /** Ollama — summarize text using local LLM */
  ollamaSummarize(options: { text: string, model?: string, language?: string }): Promise<{ success: boolean, text?: string, error?: string }>;
}

// ============================================================
// Web fallback implementation (no-op)
// ============================================================
const webBridge: IPlatformBridge = {
  isElectron: false,
  closeWindow: () => {},
  startDrag: (_pos) => {},
  doDrag: () => {},
  stopDrag: () => {},
  resizeWindow: (_w, _h) => {},
  captureScreen: async () => null,
  openExternalUrl: (url) => { window.open(url, '_blank'); },
  closeBrowserTabs: async () => ({ success: false, handled: 0, error: 'Not supported on Web' }),
  searchFiles: async () => ({ success: false, results: [], error: 'Tính năng tìm kiếm file chỉ hỗ trợ trên Desktop App.' }),
  openPath: async () => ({ success: false, error: 'Tính năng mở file chỉ hỗ trợ trên Desktop App.' }),
  closeFolderWindow: async () => ({ success: false, closed: 0, error: 'Not supported on Web' }),
  scheduleTask: async () => ({ success: false, error: 'Scheduling chỉ hỗ trợ trên Desktop App.' }),
  cancelTask: async () => ({ success: false, error: 'Not supported on Web' }),
  listTasks: async () => ({ success: true, tasks: [] }),
  onCronTriggered: () => {},
  listPlugins: async () => ({ success: true, plugins: [] }),
  executePlugin: async () => ({ success: false, error: 'Not supported on Web' }),
  hasPlugin: async () => false,
  readDocument: async () => ({ success: false, error: 'Document reader chỉ hỗ trợ trên Desktop App.' }),
  ollamaStatus: async () => ({ available: false, models: [] as string[] }),
  ollamaGenerate: async () => ({ success: false, error: 'Ollama chỉ hỗ trợ trên Desktop App.' }),
  ollamaSummarize: async () => ({ success: false, error: 'Ollama chỉ hỗ trợ trên Desktop App.' }),
};

// ============================================================
// Electron implementation (proxy sang window.electronAPI)
// ============================================================
const electronBridge: IPlatformBridge = {
  isElectron: true,
  closeWindow: () => (window as any).electronAPI?.closeWindow(),
  startDrag: (pos) => (window as any).electronAPI?.startDrag(pos),
  doDrag: () => (window as any).electronAPI?.doDrag(),
  stopDrag: () => (window as any).electronAPI?.stopDrag(),
  resizeWindow: (w, h, options) => (window as any).electronAPI?.resizeWindow(w, h, options),
  captureScreen: (opts) => (window as any).electronAPI?.captureScreen(opts) ?? Promise.resolve(null),
  controlPresentation: async (options) => {
    if ((window as any).electronAPI?.controlPresentation) {
       return await (window as any).electronAPI.controlPresentation(options);
    }
    return { success: false, error: 'electronAPI missing' };
  },
  openExternalUrl: (url) => {
    // Electron: use IPC to call shell.openExternal in main process
    if ((window as any).electronAPI?.invoke) {
      (window as any).electronAPI.invoke('open-external-url', url);
    } else {
      window.open(url, '_blank');
    }
  },
  closeBrowserTabs: async (options) => {
    if ((window as any).electronAPI?.closeBrowserTabs) {
      return await (window as any).electronAPI.closeBrowserTabs(options);
    }
    return { success: false, handled: 0, error: 'electronAPI missing' };
  },
  searchFiles: async (options) => {
    if ((window as any).electronAPI?.searchFiles) {
      return await (window as any).electronAPI.searchFiles(options);
    }
    return { success: false, results: [], error: 'electronAPI missing' };
  },
  openPath: async (options) => {
    if ((window as any).electronAPI?.openPath) {
      return await (window as any).electronAPI.openPath(options);
    }
    return { success: false, error: 'electronAPI missing' };
  },
  closeFolderWindow: async (options) => {
    if ((window as any).electronAPI?.closeFolderWindow) {
      return await (window as any).electronAPI.closeFolderWindow(options);
    }
    return { success: false, closed: 0, error: 'electronAPI missing' };
  },
  scheduleTask: async (options) => {
    if ((window as any).electronAPI?.scheduleTask) {
      return await (window as any).electronAPI.scheduleTask(options);
    }
    return { success: false, error: 'electronAPI missing' };
  },
  cancelTask: async (taskId) => {
    if ((window as any).electronAPI?.cancelTask) {
      return await (window as any).electronAPI.cancelTask(taskId);
    }
    return { success: false, error: 'electronAPI missing' };
  },
  listTasks: async () => {
    if ((window as any).electronAPI?.listTasks) {
      return await (window as any).electronAPI.listTasks();
    }
    return { success: true, tasks: [] };
  },
  onCronTriggered: (callback) => {
    if ((window as any).electronAPI?.onCronTriggered) {
      (window as any).electronAPI.onCronTriggered(callback);
    }
  },
  listPlugins: async () => {
    if ((window as any).electronAPI?.listPlugins) {
      return await (window as any).electronAPI.listPlugins();
    }
    return { success: true, plugins: [] };
  },
  executePlugin: async (name, params) => {
    if ((window as any).electronAPI?.executePlugin) {
      return await (window as any).electronAPI.executePlugin(name, params);
    }
    return { success: false, error: 'electronAPI missing' };
  },
  hasPlugin: async (name) => {
    if ((window as any).electronAPI?.hasPlugin) {
      return await (window as any).electronAPI.hasPlugin(name);
    }
    return false;
  },
  readDocument: async (options) => {
    if ((window as any).electronAPI?.readDocument) {
      return await (window as any).electronAPI.readDocument(options);
    }
    return { success: false, error: 'electronAPI missing' };
  },
  ollamaStatus: async () => {
    if ((window as any).electronAPI?.ollamaStatus) {
      return await (window as any).electronAPI.ollamaStatus();
    }
    return { available: false, models: [] as string[] };
  },
  ollamaGenerate: async (options) => {
    if ((window as any).electronAPI?.ollamaGenerate) {
      return await (window as any).electronAPI.ollamaGenerate(options);
    }
    return { success: false, error: 'electronAPI missing' };
  },
  ollamaSummarize: async (options) => {
    if ((window as any).electronAPI?.ollamaSummarize) {
      return await (window as any).electronAPI.ollamaSummarize(options);
    }
    return { success: false, error: 'electronAPI missing' };
  },
};

// ============================================================
// Auto-detect runtime environment
// ============================================================
const isRunningInElectron = (): boolean =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron');

/**
 * Singleton platform bridge.
 * Import và sử dụng trực tiếp:
 *   import { platform } from '@shared/platformBridge';
 *   if (platform.isElectron) { ... }
 */
export const platform: IPlatformBridge = isRunningInElectron()
  ? electronBridge
  : webBridge;
