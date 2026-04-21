const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  closeWindow: () => ipcRenderer.send('window-close'),
  startDrag: (pos) => ipcRenderer.send('drag-start', pos),
  doDrag: () => ipcRenderer.send('drag-do'),
  stopDrag: () => ipcRenderer.send('drag-stop'),
  resizeWindow: (width, height, options) => ipcRenderer.send('window-resize', { width, height, ...options }),
  // Phase 1: Screen Vision — capture desktop screenshot as base64 JPEG
  captureScreen: (opts) => ipcRenderer.invoke('capture-screen', opts),
  controlPresentation: (options) => ipcRenderer.invoke('control-presentation', options),
  // Phase 2: Active Window Context
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  // Advanced Browser Control
  closeBrowserTabs: (options) => ipcRenderer.invoke('close-browser-tabs', options),
  // Phase 5: File Search & Navigation
  searchFiles: (options) => ipcRenderer.invoke('search-files', options),
  openPath: (options) => ipcRenderer.invoke('open-path', options),
  closeFolderWindow: (options) => ipcRenderer.invoke('close-folder-window', options),
  // Cron Scheduling — persistent reminders & scheduled tasks
  scheduleTask: (options) => ipcRenderer.invoke('schedule-task', options),
  cancelTask: (taskId) => ipcRenderer.invoke('cancel-task', taskId),
  listTasks: () => ipcRenderer.invoke('list-tasks'),
  onCronTriggered: (callback) => ipcRenderer.on('cron-triggered', (_e, data) => callback(data)),
  // Plugin Engine — dynamic plugin management
  listPlugins: () => ipcRenderer.invoke('list-plugins'),
  getPluginDeclarations: () => ipcRenderer.invoke('get-plugin-declarations'),
  executePlugin: (name, params) => ipcRenderer.invoke('execute-plugin', { name, params }),
  reloadPlugins: () => ipcRenderer.invoke('reload-plugins'),
  togglePlugin: (name, enabled) => ipcRenderer.invoke('toggle-plugin', { name, enabled }),
  hasPlugin: (name) => ipcRenderer.invoke('has-plugin', name),
  // Document Reader — read PDF, DOCX, TXT content
  readDocument: (options) => ipcRenderer.invoke('read-document', options),
  // Ollama / Local LLM — offline text processing
  ollamaStatus: () => ipcRenderer.invoke('ollama-status'),
  ollamaGenerate: (options) => ipcRenderer.invoke('ollama-generate', options),
  ollamaSummarize: (options) => ipcRenderer.invoke('ollama-summarize', options),
  ollamaListModels: () => ipcRenderer.invoke('ollama-list-models'),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
});
