import path from 'path';
import fs from 'fs';
import { spawn, exec } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
// Node.js v24 fix: `import { app } from 'electron'` fails because v24 removed
// automatic named-export detection from CJS modules.
// `import * as ns from 'electron'` bypasses the static named-export check.
// Electron's ESM loader intercepts this and returns the full Electron API namespace.
import * as _electronNs from 'electron';
const { app, BrowserWindow, screen, ipcMain, session, Tray, Menu, nativeImage, desktopCapturer, globalShortcut, shell } = _electronNs;

const require = createRequire(import.meta.url);
const cronManager = require('./cronManager.cjs');
const securityGuard = require('./securityGuard.cjs');
const pluginLoader = require('./pluginLoader.cjs');
const { readDocument } = require('./documentReader.cjs');
const ollamaService = require('./ollamaService.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

// Giải quyết đường dẫn icon đúng cả khi dev lẫn khi đã build (packaged)
// - Dev:        <root>/public/aura_npc_logo.png
// - Production: <resourcesPath>/app/public/aura_npc_logo.png  hoặc dist/
function resolveIconPath() {
  if (isDev) {
    return path.join(__dirname, '../public/aura_npc_logo.png');
  }
  // Khi đã đóng gói bằng electron-builder, app.getAppPath() trỏ đúng vào thư mục app
  const fromResources = path.join(process.resourcesPath, 'app', 'public', 'aura_npc_logo.png');
  if (fs.existsSync(fromResources)) return fromResources;
  // Fallback: nếu file được copy vào dist
  return path.join(app.getAppPath(), 'dist', 'aura_npc_logo.png');
}

let mainWindow = null;
let tray = null;
let proxyProcess = null;
app.isQuiting = false;

// ── Tách userData giữa dev và production để tránh cache conflict ─
// Khi vừa cài bản release vừa chạy electron:dev, cả hai cùng
// ghi vào %APPDATA%\Aura Assistant → cache bị lock → lỗi Access Denied.
if (isDev) {
  const devDataPath = path.join(__dirname, '../.dev-cache');
  app.setPath('userData', devDataPath);
  console.log('[Electron DEV] userData →', devDataPath);
}


function startProxyServer() {
  if (proxyProcess) {
    console.log('[Electron] CLIProxyAPI is already running.');
    return;
  }

  const proxyBaseDir = isDev 
    ? path.join(__dirname, '../resources/proxy') 
    : path.join(process.resourcesPath, 'proxy');

  const proxyPath = path.join(proxyBaseDir, process.platform === 'win32' ? 'cliproxy.exe' : 'cliproxy');

  console.log(`[Electron] Attempting to start CLIProxyAPI...`);
  if (!fs.existsSync(proxyPath)) {
    console.error(`[Electron] ❌ Proxy binary NOT FOUND at: ${proxyPath}. Make sure to build it first.`);
    return;
  }

  const killCmd = process.platform === 'win32' ? 'taskkill /F /IM cliproxy.exe /T' : 'pkill -f cliproxy';
  console.log(`[Electron] Stopping any dangling proxy processes...`);
  
  exec(killCmd, (err) => {
    // Chờ 500ms cho OS dọn dẹp port hoàn toàn
    setTimeout(() => {
      try {
        proxyProcess = spawn(proxyPath, [], {
          cwd: proxyBaseDir,
          stdio: 'pipe'
        });

        proxyProcess.stdout.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) console.log(`[CLIProxyAPI]: ${msg}`);
        });

        proxyProcess.stderr.on('data', (data) => {
          const msg = data.toString().trim();
          if (msg) console.error(`[CLIProxyAPI Error]: ${msg}`);
        });

        proxyProcess.on('error', (err) => {
          console.error(`[Electron] Failed to start Proxy process: ${err.message}`);
        });

        proxyProcess.on('close', (code) => {
          console.log(`[CLIProxyAPI] Process exited with code ${code}`);
          proxyProcess = null;
        });
      } catch (err) {
        console.error(`[Electron] Error spawning Proxy process: ${err}`);
      }
    }, 500);
  });
}

function createWindow() {
  // Lấy diện tích làm việc của màn hình để đặt cửa sổ ở góc dưới bên phải
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  const appIcon = nativeImage.createFromPath(resolveIconPath());

  mainWindow = new BrowserWindow({
    width: 380,
    height: 600,
    x: width - 400, 
    y: height - 650,
    transparent: true,    // Chế độ trong suốt
    frame: false,         // Bỏ viền Windows
    alwaysOnTop: true,    // Luôn nổi đè lên app khác
    resizable: true,
    hasShadow: false,
    icon: appIcon,        // ✅ Icon cho cửa sổ, taskbar, Alt+Tab
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Enable F12 to open Developer Tools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // CRITICAL: Redirect window.open() to system default browser
  // Prevents Electron from creating child BrowserWindows that steal focus
  // and suspend AudioContext (breaking Aura's voice/audio pipeline)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    // Re-show and re-focus Aura window after browser opens
    // Without this, the floating window gets buried behind the browser
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.setAlwaysOnTop(true);
        mainWindow.focus();
      }
    }, 600);
    return { action: 'deny' };
  });
}

// Set this for transparency on Linux/Windows just in case
app.commandLine.appendSwitch('enable-transparent-visuals');
// Cho phép âm thanh tự động phát không cần user click mỏi tay
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// BUG-03 FIX: Bypass Windows OS-level microphone dialog in Electron
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
// Disable WebRTC audio features that can interfere with AudioContext in some builds
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

app.whenReady().then(() => {
  // BUG-03 FIX: Cấp quyền sử dụng Microphone & Camera triệt để cho Electron
  // Cấp thêm audioCapture & videoCapture riêng lẽ ngoài 'media' chung
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'videoCapture', 'clipboard-read', 'notifications'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ['media', 'audioCapture', 'videoCapture', 'clipboard-read', 'notifications'];
    return allowed.includes(permission);
  });

  // Create System Tray — dùng resolveIconPath() để đúng cả dev lẫn production
  const trayIconImage = nativeImage.createFromPath(resolveIconPath());
  tray = new Tray(trayIconImage.isEmpty() 
    ? nativeImage.createEmpty()  // fallback tránh crash nếu file không tồn tại
    : trayIconImage.resize({ width: 16, height: 16 })
  );
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '🌟 Mở Aura', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: '❌ Tắt hoàn toàn', click: () => { app.isQuiting = true; app.quit(); } }
  ]);
  
  tray.setToolTip('Aura Assistant');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });

  // Phase 4: Global Hotkey — Ctrl+Shift+A to toggle Aura visibility
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });

  // [CLIProxy DISABLED] — Desktop now uses direct Gemini API Key instead of CLIProxyAPI.
  // Uncomment below to re-enable if needed:
  // startProxyServer();

  // ── Initialize CronManager & SecurityGuard ──
  const appDataPath = app.getPath('userData');
  cronManager.init(appDataPath);
  securityGuard.init(appDataPath);
  cronManager.onTrigger((task) => {
    console.log(`[Electron] Cron triggered: "${task.label}"`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cron-triggered', {
        id: task.id,
        label: task.label,
        type: task.type,
        repeat: task.repeat,
      });
      // Show window if hidden so user sees the reminder
      if (!mainWindow.isVisible()) mainWindow.show();
    }
  });

  // ── Initialize PluginLoader ──
  pluginLoader.init(appDataPath);

  // ── Initialize Ollama (check if available) ──
  ollamaService.checkStatus().catch(() => {});

  // Fix transparency glitch when waiting for app ready
  setTimeout(createWindow, 400);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Giao tiếp IPC với Frontend 
ipcMain.on('window-close', () => mainWindow?.hide());

// Open an external URL in the system default browser (used for Proxy OAuth)
ipcMain.handle('open-external-url', async (_event, url) => {
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, error: 'Invalid URL format' };
    }
    await shell.openExternal(url);
    return { success: true };
  } catch (err) {
    console.error('[Electron] open-external-url error:', err);
    return { success: false, error: err.message };
  }
});

let dragOffset = null;

ipcMain.on('drag-start', (e) => {
  if (!mainWindow) return;
  const [winX, winY] = mainWindow.getPosition();
  const pointerPos = screen.getCursorScreenPoint();
  dragOffset = { x: pointerPos.x - winX, y: pointerPos.y - winY };
});

ipcMain.on('drag-do', (e) => {
  if (!dragOffset || !mainWindow) return;
  const pointerPos = screen.getCursorScreenPoint();
  mainWindow.setPosition(pointerPos.x - dragOffset.x, pointerPos.y - dragOffset.y);
});

ipcMain.on('drag-stop', (e) => {
  dragOffset = null;
});

ipcMain.on('window-resize', (e, size) => {
  try {
    if (!mainWindow) return;
    // Debounce: ignore if another resize is pending
    if (mainWindow._resizeTimeout) clearTimeout(mainWindow._resizeTimeout);
    mainWindow._resizeTimeout = setTimeout(() => {
      const oldBounds = mainWindow.getBounds();
      const width = Math.round(size?.width);
      const height = Math.round(size?.height);
      
      // Safety check for invalid dimensions
      if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        console.warn('[Main] Invalid resize dimensions received:', size);
        return;
      }

      let newX = oldBounds.x;
      let newY = oldBounds.y - (height - oldBounds.height); // Default bottom anchor

      if (size?.restorePosition && mainWindow._savedPreToggleBounds) {
        newX = mainWindow._savedPreToggleBounds.x;
        newY = mainWindow._savedPreToggleBounds.y;
        delete mainWindow._savedPreToggleBounds;
      } else {
        if (size?.savePositionForRestore) {
          mainWindow._savedPreToggleBounds = oldBounds;
        }

        if (size?.anchorX === 'center') {
          newX = oldBounds.x - (width - oldBounds.width) / 2;
        } else if (size?.anchorX === 'left') {
          newX = oldBounds.x;
        } else if (size?.anchorX === 'right') {
          newX = oldBounds.x - (width - oldBounds.width);
        } else {
          newX = oldBounds.x - (width - oldBounds.width) / 2; // Default center
        }
      }

      const display = screen.getDisplayMatching(oldBounds) || screen.getPrimaryDisplay();
      const workArea = display.workArea;

      if (newX < workArea.x) newX = workArea.x;
      if (newX + width > workArea.x + workArea.width) newX = workArea.x + workArea.width - width;
      
      if (newY < workArea.y) newY = workArea.y;
      if (newY + height > workArea.y + workArea.height) newY = workArea.y + workArea.height - height;

      // Fixed for Windows: Rapid setBounds on transparent windows can cause invisible crashes.
      // Use .setContentBounds or .setBounds carefully.
      // Step 1: Resize first (keeps position, prevents flicker)
      mainWindow.setSize(width, height);
      // Step 2: Reposition after a short delay 
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.setPosition(Math.round(newX), Math.round(newY));
        // Force compositor redraw for transparent window
        mainWindow.webContents.invalidate();
      }, 50);
    }, 16); // ~1 frame debounce
  } catch (error) {
    console.error('[Main] window-resize error:', error);
  }
});

// ============================================================
// Phase 1: SCREEN VISION — Capture desktop screenshot
// ============================================================
ipcMain.handle('capture-screen', async (_event, opts) => {
  try {
    // Nếu yêu cầu capture cửa sổ PowerPoint/Slides cụ thể (dùng trong chế độ thuyết trình)
    if (opts?.presentationMode) {
      try {
        const winSources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 1920, height: 1080 }
        });
        // Tìm cửa sổ PowerPoint Slide Show hoặc Google Slides
        const pptSource = winSources.find(s =>
          /Slide Show|PowerPoint|POWERPNT|Google Slides|Canva/i.test(s.name)
        );
        if (pptSource && pptSource.thumbnail.getSize().width > 100) {
          const jpegBuffer = pptSource.thumbnail.toJPEG(70);
          console.log(`[Main] capture-screen: PowerPoint window found — "${pptSource.name}"`);
          return jpegBuffer.toString('base64');
        }
      } catch {}
    }

    // Fallback / chế độ thông thường: chụp tất cả màn hình
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    });
    if (sources.length === 0) return null;

    // Mặc định: Chụp màn hình chính (primary display)
    const primaryDisplayId = screen.getPrimaryDisplay().id;
    // Tìm source có id chứa primary display ID (định dạng của electron thường là screen:<id>:<other>)
    let target = sources.find(s => s.id.includes(primaryDisplayId.toString()));
    
    // Fallback: nếu không tìm thấy theo ID, luôn lấy màn hình đầu tiên (thường là màn chính)
    if (!target) {
      target = sources[0];
    }
    
    const jpegBuffer = target.thumbnail.toJPEG(60);
    return jpegBuffer.toString('base64');
  } catch (err) {
    console.error('[Main] capture-screen error:', err);
    return null;
  }
});

// Cleanup global shortcuts on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  cronManager.destroy();
});

// ============================================================
// CRON SCHEDULING — Schedule/Cancel/List persistent tasks
// ============================================================
ipcMain.handle('schedule-task', async (_event, options) => {
  try {
    const result = cronManager.addTask(options);
    securityGuard.audit('schedule-task', `LABEL="${options.label}" TYPE=${options.cronExpression ? 'cron' : 'delay'}`);
    return result;
  } catch (err) {
    console.error('[Electron] schedule-task error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('cancel-task', async (_event, taskId) => {
  try {
    const result = cronManager.removeTask(taskId);
    securityGuard.audit('cancel-task', `ID=${taskId}`);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('list-tasks', async () => {
  try {
    return { success: true, tasks: cronManager.listTasks() };
  } catch (err) {
    return { success: false, tasks: [], error: err.message };
  }
});
// ============================================================
// Active Window Context - Gets foreground window title
// ============================================================
ipcMain.handle('get-active-window', async () => {
  try {
    const activeWin = await import('active-win');
    const win = await activeWin.default();
    if (win) {
      // Exclude Aura's own window to prevent self-referencing
      if (win.title.includes('Aura') || win.owner?.name?.includes('Aura') || win.owner?.name?.includes('Electron')) {
        return null;
      }
      return `${win.owner?.name || 'Unknown App'} - ${win.title}`;
    }
    return null;
  } catch (err) {
    console.error('[Main] get-active-window error:', err);
    return null;
  }
});

/**
 * Handle browser tab closing via PowerShell UI Automation.
 */
ipcMain.handle('close-browser-tabs', async (_event, options) => {
  if (process.platform !== 'win32') {
    return { success: false, handled: 0, error: 'Windows only' };
  }
  
  try {
    const { matchKeywords = [], excludeKeywords = [], closeAll = false } = options || {};
    
    // Prepare keywords outside the template literal to avoid nesting confusion
    const matchLine = matchKeywords.map(k => `"${k.replace(/"/g, '""')}"`).join(',');
    const excludeLine = excludeKeywords.map(k => `"${k.replace(/"/g, '""')}"`).join(',');

    const psScript = `
      # BUG FIX: Must load BOTH assemblies — TreeScope/PropertyCondition live in UIAutomationTypes
      Add-Type -AssemblyName UIAutomationClient
      Add-Type -AssemblyName UIAutomationTypes
      $ErrorActionPreference = "SilentlyContinue"

      function ContainsAny([string]$name, [string[]]$keywords) {
          if (-not $keywords -or $keywords.Length -eq 0) { return $false }
          foreach ($k in $keywords) { 
              if ($name -match [regex]::Escape($k)) { return $true } 
          }
          return $false
      }

      $matchList = @(${matchLine})
      $excludeList = @(${excludeLine})
      $isCloseAll = [bool]$${closeAll ? 'true' : 'false'}

      $chromeWindows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
          [System.Windows.Automation.TreeScope]::Children,
          [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ClassNameProperty, "Chrome_WidgetWin_1")
      )

      $totalClosed = 0

      foreach ($win in $chromeWindows) {
          # BUG FIX: Filter out non-browser windows (VSCode, Electron apps, Widgets)
          # Only process actual Chrome or Edge browser windows
          $winName = $win.Current.Name
          $isBrowser = ($winName -match "(?i)(Google Chrome|Microsoft Edge|Brave|Opera|Vivaldi)") -or
                       ($winName -match "(?i)\\s*-\\s*(Chrome|Edge|Brave)$")
          if (-not $isBrowser) { continue }

          $tabCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
          $tabs = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)
          
          foreach ($tab in $tabs) {
              $name = $tab.Current.Name
              if ([string]::IsNullOrWhiteSpace($name)) { continue }

              $closeThis = $false
              if ($isCloseAll) {
                  $closeThis = -not (ContainsAny $name $excludeList)
              } else {
                  if (ContainsAny $name $matchList) {
                      $closeThis = -not (ContainsAny $name $excludeList)
                  }
              }

              if ($closeThis) {
                  $btnCond = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
                  $btns = $tab.FindAll([System.Windows.Automation.TreeScope]::Children, $btnCond)
                  foreach ($btn in $btns) {
                      # BUG FIX: Broadened regex to handle Vietnamese encoding variants
                      if ($btn.Current.Name -match "(?i)(Close|X|Dismiss)" -or $btn.Current.Name -like "*ng*") {
                          $pattern = $null
                          if ($btn.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
                              $pattern.Invoke()
                              $totalClosed++
                              Start-Sleep -Milliseconds 200
                              break
                          }
                      }
                  }
              }
          }
      }
      Write-Host "AuraCount: $totalClosed"
    `;

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    
    return await new Promise((resolve) => {
      exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 15000 }, (err, stdout, stderr) => {
         console.log('[Electron] close-browser-tabs stdout:', stdout);
         if (stderr) console.warn('[Electron] close-browser-tabs stderr:', stderr);
         const match = /AuraCount:\s+(\d+)/.exec(stdout);
         const count = match ? parseInt(match[1]) : 0;
         if (err) {
           console.error('[Electron] close-browser-tabs error:', err.message);
           resolve({ success: false, handled: count, error: err.message });
         } else {
           resolve({ success: true, handled: count });
         }
      });
    });
  } catch (err) {
    console.error('[Electron] close-browser-tabs exception:', err);
    return { success: false, handled: 0, error: err.message };
  }
});

// ============================================================
// Phase 5: FILE SEARCH — Search files/folders on disk
// ============================================================
ipcMain.handle('search-files', async (_event, options) => {
  if (process.platform !== 'win32') {
    return { success: false, results: [], error: 'Windows only' };
  }

  try {
    const { query = '', scope = 'documents', file_type = '*', max_results = 20 } = options || {};

    if (!query.trim()) {
      return { success: false, results: [], error: 'Empty query' };
    }

    // Map scope to actual paths
    const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default';
    const scopePaths = {
      'documents': path.join(userProfile, 'Documents'),
      'desktop': path.join(userProfile, 'Desktop'),
      'downloads': path.join(userProfile, 'Downloads'),
      'pictures': path.join(userProfile, 'Pictures'),
      'all': userProfile, // Search entire user profile
    };

    let searchPath = scopePaths[scope] || scope; // Custom path or mapped scope
    
    // Security: Use SecurityGuard to validate path
    const pathCheck = securityGuard.validatePath(searchPath);
    if (!pathCheck.allowed) {
      securityGuard.audit('search-files', `QUERY="${query}" PATH="${searchPath}"`, true);
      return { success: false, results: [], error: pathCheck.reason };
    }
    securityGuard.audit('search-files', `QUERY="${query}" SCOPE=${scope}`);

    // Validate path exists
    if (!fs.existsSync(searchPath)) {
      return { success: false, results: [], error: `Path not found: ${searchPath}` };
    }

    // Build PowerShell search command
    const ext = file_type && file_type !== '*' ? `.${file_type.replace(/^\./, '')}` : '';
    const filter = ext ? `*${query}*${ext}` : `*${query}*`;
    const maxDepth = scope === 'all' ? 4 : 6; // Limit depth for 'all' to avoid extreme slowness
    const limit = Math.min(Number(max_results) || 20, 50);

    const psScript = `
      $ErrorActionPreference = "SilentlyContinue"
      $results = @()
      $searchPath = '${searchPath.replace(/'/g, "''")}'
      $filter = '${filter.replace(/'/g, "''")}'
      
      $items = Get-ChildItem -Path $searchPath -Recurse -Depth ${maxDepth} -Filter $filter -ErrorAction SilentlyContinue | Select-Object -First ${limit}
      
      foreach ($item in $items) {
        $type = if ($item.PSIsContainer) { "folder" } else { "file" }
        $size = if ($item.PSIsContainer) { 0 } else { $item.Length }
        $modified = $item.LastWriteTime.ToString("yyyy-MM-dd HH:mm")
        $results += "$($item.Name)|$($item.FullName)|$type|$size|$modified"
      }
      $results | ForEach-Object { Write-Host $_ }
    `;

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

    return await new Promise((resolve) => {
      exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 12000 }, (err, stdout, stderr) => {
        if (err && err.killed) {
          resolve({ success: false, results: [], error: 'Tìm kiếm quá lâu — thử thu hẹp phạm vi.' });
          return;
        }

        const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
        const results = lines.map(line => {
          const [name, fullPath, type, size, modified] = line.split('|');
          return {
            name: name || '',
            path: fullPath || '',
            type: type || 'file',
            size: parseInt(size) || 0,
            modified: modified || '',
          };
        }).filter(r => r.name && r.path);

        console.log(`[Electron] search-files: Found ${results.length} results for "${query}" in ${searchPath}`);
        resolve({ success: true, results, totalFound: results.length });
      });
    });
  } catch (err) {
    console.error('[Electron] search-files exception:', err);
    return { success: false, results: [], error: err.message };
  }
});

// ============================================================
// Phase 8: Control Presentation (SendKeys via PowerShell)
// ============================================================
ipcMain.handle('control-presentation', async (_event, options) => {
  if (process.platform !== 'win32') return { success: false, error: 'Windows only' };
  try {
    const action = options?.action || "next";

    // ── goto_slide: nhảy đến slide cụ thể bằng cách gõ số + Enter
    if (action === "goto_slide") {
      const rawNum = options?.slide_num;
      const slideNum = Math.floor(Number(rawNum));
      if (!Number.isFinite(slideNum) || slideNum < 1 || slideNum > 9999) {
        return { success: false, error: 'slide_num không hợp lệ' };
      }
      const safeNum = slideNum.toString();
      const psScript = `
        $wshell = New-Object -ComObject wscript.shell
        if ($wshell.AppActivate("PowerPoint")) {
          Start-Sleep -Milliseconds 300
          $wshell.SendKeys("${safeNum}")
          Start-Sleep -Milliseconds 150
          $wshell.SendKeys("{ENTER}")
        } elseif ($wshell.AppActivate("Chrome")) {
          Start-Sleep -Milliseconds 300
          $wshell.SendKeys("${safeNum}")
          Start-Sleep -Milliseconds 150
          $wshell.SendKeys("{ENTER}")
        } elseif ($wshell.AppActivate("Edge")) {
          Start-Sleep -Milliseconds 300
          $wshell.SendKeys("${safeNum}")
          Start-Sleep -Milliseconds 150
          $wshell.SendKeys("{ENTER}")
        } else {
          $wshell.SendKeys("${safeNum}")
          Start-Sleep -Milliseconds 150
          $wshell.SendKeys("{ENTER}")
        }
      `;
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      return await new Promise((resolve) => {
        exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 4000 }, (err) => {
          if (err) resolve({ success: false, error: err.message });
          else resolve({ success: true });
        });
      });
    }

    // ── Các action dùng phím tắt thông thường
    let key = "{RIGHT}";
    if (action === "start") key = "{F5}";
    else if (action === "prev") key = "{LEFT}";
    else if (action === "end") key = "{ESCAPE}";

    const psScript = `
      $wshell = New-Object -ComObject wscript.shell;
      if ($wshell.AppActivate("PowerPoint")) {
        Start-Sleep -Milliseconds 300
        $wshell.SendKeys("${key}")
      } elseif ($wshell.AppActivate("Chrome")) {
        Start-Sleep -Milliseconds 300
        $wshell.SendKeys("${key}")
      } elseif ($wshell.AppActivate("Edge")) {
        Start-Sleep -Milliseconds 300
        $wshell.SendKeys("${key}")
      } else {
        $wshell.SendKeys("${key}")
      }
    `;
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

    // ── "next": after pressing RIGHT, verify slideshow is still active.
    // When PowerPoint exits the slideshow (after pressing RIGHT on the end screen),
    // the "Slide Show" window disappears — we return success:false to stop the scan loop.
    if (action === "next") {
      const pressOk = await new Promise((resolve) => {
        exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 3000 }, (err) => {
          resolve(!err);
        });
      });
      if (!pressOk) return { success: false, error: 'keypress_failed' };
      // Wait for PowerPoint to process the keypress and potentially exit slideshow
      await new Promise(r => setTimeout(r, 400));
      try {
        const winSources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 1, height: 1 }
        });
        const slideshowActive = winSources.some(s => /Slide Show/i.test(s.name));
        if (!slideshowActive) {
          console.log('[Main] control-presentation: slideshow exited after RIGHT press');
          return { success: false, error: 'slideshow_ended' };
        }
      } catch {
        // If check fails, assume still active
      }
      return { success: true };
    }

    return await new Promise((resolve) => {
      exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 3000 }, (err) => {
        if (err) resolve({ success: false, error: err.message });
        else resolve({ success: true });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============================================================
// Phase 5: OPEN PATH — Open file/folder on disk
// ============================================================
ipcMain.handle('open-path', async (_event, options) => {
  try {
    let { path: targetPath, reveal_in_folder = false } = options || {};
    
    if (!targetPath) {
      return { success: false, error: 'No path provided' };
    }

    // Normalize path: fix forward slashes, strip quotes, resolve
    targetPath = targetPath.replace(/\//g, '\\').replace(/^["']+|["']+$/g, '').trim();
    targetPath = path.resolve(targetPath);
    
    console.log(`[Electron] open-path: Attempting to ${reveal_in_folder ? 'reveal' : 'open'}: ${targetPath}`);

    // Security: Use SecurityGuard for comprehensive validation
    const pathCheck = securityGuard.validatePath(targetPath);
    if (!pathCheck.allowed) {
      securityGuard.audit('open-path', `PATH="${targetPath}"`, true);
      return { success: false, error: pathCheck.reason };
    }

    const extCheck = securityGuard.validateExtension(targetPath);
    if (!extCheck.allowed && !reveal_in_folder) {
      securityGuard.audit('open-path', `PATH="${targetPath}" EXT_BLOCKED`, true);
      shell.showItemInFolder(targetPath);
      return { success: true, action: 'revealed_in_folder', note: extCheck.reason + ' File được hiển thị trong Explorer thay vì chạy trực tiếp.' };
    }

    securityGuard.audit('open-path', `PATH="${targetPath}" REVEAL=${reveal_in_folder}`);

    // Check if path exists
    if (!fs.existsSync(targetPath)) {
      console.warn(`[Electron] open-path: Path does NOT exist: ${targetPath}`);
      return { success: false, error: `Đường dẫn không tồn tại: ${targetPath}` };
    }

    if (reveal_in_folder) {
      shell.showItemInFolder(targetPath);
      console.log(`[Electron] open-path: Revealed in folder: ${targetPath}`);
      return { success: true, action: 'revealed_in_folder' };
    } else {
      const errorMsg = await shell.openPath(targetPath);
      if (errorMsg) {
        console.error(`[Electron] open-path: shell.openPath error: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
      console.log(`[Electron] open-path: Opened successfully: ${targetPath}`);
      return { success: true, action: 'opened' };
    }
  } catch (err) {
    console.error('[Electron] open-path error:', err);
    return { success: false, error: err.message };
  }
});

// ============================================================
// Phase 5: CLOSE FOLDER WINDOW — Close File Explorer windows
// ============================================================
ipcMain.handle('close-folder-window', async (_event, options) => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Windows only' };
  }

  try {
    const { path: targetPath, close_all = false } = options || {};

    const psScript = close_all
      ? `
        $shell = New-Object -ComObject Shell.Application
        $wins = $shell.Windows() | Where-Object { $_.Name -eq 'File Explorer' -or $_.Name -eq 'Windows Explorer' }
        $count = 0
        foreach ($w in $wins) { try { $w.Quit(); $count++ } catch {} }
        Write-Host "AuraClosed: $count"
      `
      : `
        $shell = New-Object -ComObject Shell.Application
        $wins = $shell.Windows() | Where-Object { $_.Name -eq 'File Explorer' -or $_.Name -eq 'Windows Explorer' }
        $targetLower = '${(targetPath || '').replace(/'/g, "''").replace(/\\/g, '\\')}'
        $count = 0
        foreach ($w in $wins) {
          try {
            $loc = $w.LocationURL
            $locPath = [uri]::UnescapeDataString($loc) -replace 'file:///','' -replace '/',"\\"
            if ($locPath -like "*$targetLower*" -or '${targetPath || ''}' -eq '') {
              $w.Quit()
              $count++
            }
          } catch {}
        }
        Write-Host "AuraClosed: $count"
      `;

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

    return await new Promise((resolve) => {
      exec(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 8000 }, (err, stdout) => {
        const match = /AuraClosed:\s*(\d+)/.exec(stdout);
        const count = match ? parseInt(match[1]) : 0;
        console.log(`[Electron] close-folder-window: Closed ${count} Explorer windows`);
        resolve({ success: true, closed: count });
      });
    });
  } catch (err) {
    console.error('[Electron] close-folder-window error:', err);
    return { success: false, closed: 0, error: err.message };
  }
});

// ============================================================
// PLUGIN ENGINE — Load/Execute/Manage dynamic plugins
// ============================================================
ipcMain.handle('list-plugins', async () => {
  try {
    return { success: true, plugins: pluginLoader.listPlugins() };
  } catch (err) {
    return { success: false, plugins: [], error: err.message };
  }
});

ipcMain.handle('get-plugin-declarations', async () => {
  try {
    return { success: true, declarations: pluginLoader.getDeclarations() };
  } catch (err) {
    return { success: false, declarations: [], error: err.message };
  }
});

ipcMain.handle('execute-plugin', async (_event, { name, params }) => {
  try {
    securityGuard.audit('execute-plugin', `NAME=${name}`);
    const result = await pluginLoader.executePlugin(name, params, {
      appDataPath: app.getPath('userData'),
    });
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('reload-plugins', async () => {
  try {
    return pluginLoader.reload();
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('toggle-plugin', async (_event, { name, enabled }) => {
  try {
    return pluginLoader.togglePlugin(name, enabled);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('has-plugin', async (_event, name) => {
  return pluginLoader.hasPlugin(name);
});

// ============================================================
// DOCUMENT READER — Read PDF, DOCX, TXT content
// ============================================================
ipcMain.handle('read-document', async (_event, options) => {
  try {
    const filePath = (options?.path || '').toString().trim();
    if (!filePath) {
      return { success: false, error: 'No file path provided' };
    }

    // Security check
    const pathCheck = securityGuard.validatePath(filePath);
    if (!pathCheck.allowed) {
      securityGuard.audit('read-document', `PATH="${filePath}"`, true);
      return { success: false, error: pathCheck.reason };
    }
    securityGuard.audit('read-document', `PATH="${filePath}"`);

    const result = await readDocument(filePath);
    return result;
  } catch (err) {
    console.error('[Electron] read-document error:', err);
    return { success: false, error: err.message };
  }
});

// ============================================================
// OLLAMA / LOCAL LLM — Offline text processing
// ============================================================
ipcMain.handle('ollama-status', async () => {
  try {
    return await ollamaService.checkStatus();
  } catch (err) {
    return { available: false, models: [], error: err.message };
  }
});

ipcMain.handle('ollama-generate', async (_event, options) => {
  try {
    const { prompt, model, system, temperature, maxTokens } = options || {};
    if (!prompt) return { success: false, error: 'No prompt provided' };
    securityGuard.audit('ollama-generate', `MODEL=${model || 'default'} PROMPT_LEN=${prompt.length}`);
    return await ollamaService.generate(prompt, { model, system, temperature, maxTokens });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ollama-summarize', async (_event, options) => {
  try {
    const { text, model, language } = options || {};
    if (!text) return { success: false, error: 'No text provided' };
    securityGuard.audit('ollama-summarize', `TEXT_LEN=${text.length}`);
    return await ollamaService.summarize(text, { model, language });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ollama-list-models', async () => {
  return { models: ollamaService.listModels() };
});
