/**
 * AppWeb.tsx — Browser Web App UI
 *
 * Đây là UI dành riêng cho WebApp chạy trên browser:
 * - Dual-pane layout (Left: Avatar, Right: Chat)
 * - Session management sidebar
 * - PIP window support
 * - Toolbar controls
 *
 * KHÔNG có bất kỳ Electron-specific code nào ở đây:
 * - Không có window.electronAPI
 * - Không có WebkitAppRegion
 * - Không có RadialMenu
 * - Không có Screen Vision
 * - Không có drag/resize window
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  Suspense,
} from "react";
import {
  Key, Sparkles, Mic, Square, MicOff,
  Volume2, VolumeX, Send, Maximize2, Minimize2, Trash2, Image, Shield, LogOut, FileText
} from "lucide-react";
import {
  UserSettings,
  EyeState,
  UserLocation,
  ChatSession,
  ChatMessage,
  AppMode,
} from "../shared/types";
import SettingsModal from "../shared/components/SettingsModal";
import VideoPlayer from "../shared/components/VideoPlayer";
import AODDisplay from "../shared/components/AODDisplay";
import Toast from "../shared/components/Toast";
import { useGeminiLive } from "../shared/hooks/useGeminiLive";
import { encryptKey, decryptKey } from "../shared/utils/crypto";
import { CHARACTER_MODELS, DEFAULT_CHARACTER_ID } from "../shared/constants/characters";
import { ConsciousnessLoop } from "../shared/services/consciousnessLoop";
import AudioPermissionGate from "./components/AudioPermissionGate";
import LoginScreen from "../shared/components/LoginScreen";
import AdminPanel from "../shared/components/AdminPanel";
import { authService, UserProfile } from "../shared/services/authService";
import AuraEmotionSticker from "../shared/components/AuraEmotionSticker";
import DocumentPanel from "../shared/components/DocumentPanel";
import MeetingNotesPanel from "../shared/components/MeetingNotesPanel";
import { meetingHistoryService } from "../shared/services/meetingHistoryService";
import { memoryService } from "../shared/services/memoryService";

const DEFAULT_SETTINGS: UserSettings = {
  assistantName: "Aura",
  live2dModelUrl: CHARACTER_MODELS[DEFAULT_CHARACTER_ID].url,
  avatarCharacter: DEFAULT_CHARACTER_ID,
  userName: "Ông chủ",
  systemInstruction: "Aura là trợ lý tận tụy của Ông chủ (Đăng Hoàng).",
  fileContext: "",
  language: "vi",
  translationLangA: "vi",
  translationLangB: "en",
  apiKey: "",
  optimizeLatency: false,
  optimizeForCoverage: true,
  voiceSensitivity: 1.5,
  userVoiceSample: "",
  appTheme: 'dark',
  auraBackground: 'default',
  liveModel: 'gemini-2.5-flash-native-audio-preview-09-2025',
};

const STORAGE_KEYS = {
  settings: "aura_settings",
  sessions: "aura_sessions",
  legacySettings: "nana_settings",
  legacySessions: "nana_sessions",
} as const;

const Live2DAvatar = React.lazy(() => import("../shared/components/Live2DAvatar"));

const generateId = () => Math.random().toString(36).substr(2, 9);

const AppWeb: React.FC = () => {
  // ── Authentication ─────────────────────────────────────────
  const [authUser, setAuthUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  useEffect(() => {
    authService.getCurrentUser().then(user => {
      setAuthUser(user);
      if (user) memoryService.setUserId(user.uid);
      setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
  }, []);

  // ── Audio Permission Gate ─────────────────────────────────
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  // ── Settings ──────────────────────────────────────────────
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved =
      localStorage.getItem(STORAGE_KEYS.settings) ||
      localStorage.getItem(STORAGE_KEYS.legacySettings);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.apiKey) parsed.apiKey = decryptKey(parsed.apiKey);
        return { ...DEFAULT_SETTINGS, ...parsed };
      } catch (e) {
        console.warn("Failed to parse saved settings, using defaults.", e);
      }
    }
    return DEFAULT_SETTINGS;
  });
  const assistantName = (settings.assistantName || "Aura").trim() || "Aura";
  const optimizeForCoverage = settings.optimizeForCoverage !== false;

  // ── Session Management ────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved =
      localStorage.getItem(STORAGE_KEYS.sessions) ||
      localStorage.getItem(STORAGE_KEYS.legacySessions);
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // ── UI State ──────────────────────────────────────────────
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<(() => void) | undefined>(undefined);
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isMeetingMode, setIsMeetingMode] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [isFeatureToolbarOpen, setIsFeatureToolbarOpen] = useState(false);
  const [featureToolbarSpin, setFeatureToolbarSpin] = useState<"cw" | "ccw">("cw");
  const [isPIPActive, setIsPIPActive] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const live2dContainerRef = useRef<HTMLDivElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isListeningPaused, setIsListeningPaused] = useState(false);
  const pendingConnectAfterSessionRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const consciousnessRef = useRef<ConsciousnessLoop | null>(null);
  const [location, setLocation] = useState<UserLocation | null>(null);

  // ── Geolocation ───────────────────────────────────────────
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setLocation({ lat: 21.0285, lng: 105.8542 })
      );
    } else {
      setLocation({ lat: 21.0285, lng: 105.8542 });
    }
  }, []);

  // ── API Key check ─────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      if ((settings.apiKey && settings.apiKey.length > 10) || process.env.API_KEY) {
        setApiKeyReady(true);
        return;
      }
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === "function") {
        const has = await window.aistudio.hasSelectedApiKey();
        setApiKeyReady(has);
        return;
      }
      setApiKeyReady(false);
    };
    check();
  }, [settings.apiKey]);

  // ── Session Persistence ───────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
    localStorage.removeItem(STORAGE_KEYS.legacySessions);
  }, [sessions]);

  // ── Settings open handler ─────────────────────────────────
  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
    setToastMessage("Đang mở cài đặt...");
  }, []);

  // ── Gemini Live ───────────────────────────────────────────
  const {
    state, videoState, setVideoState, isDeepSleep, setIsDeepSleep,
    connect, disconnect, active, error, clearError, liveTranscript,
    mode, setMode, history: hookHistory, volume, notification,
    clearNotification, sendText, sendScreenFrame, toggleMic, toggleSpeaker,
    toggleSpeakerAndReconnect,
    toggleLiveChat, pausePlayback, resumePlayback, pauseListening, resumeListening,
    documentData, clearDocument, meetingNotes, clearMeetingNotes, removeMeetingNote, togglePinNote,
  } = useGeminiLive(settings, location, handleOpenSettings, {
    onToggleMute: (mute) => {
      setIsSpeakerMuted(mute);
      setToastMessage(mute ? "🔇 Đã tắt tiếng Aura." : "🔊 Đã bật tiếng Aura.");
    },
    onToggleScreenVision: (enable) => {
      // Stub cho Web, vì Web hiện tại chưa hỗ trợ screen capture nền tảng
      setToastMessage("Tính năng xem màn hình chỉ hỗ trợ trên Desktop App.");
    },
    onToggleCameraVision: (enable) => {
      // Stub cho Web
      setToastMessage("Tính năng xem camera chưa tích hợp trên Web.");
    },
    onToggleMeetingMode: (enable) => handleToggleMeetingMode(enable),
    onClearChat: () => {
      if (currentSessionId) {
        setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [] } : s));
        setToastMessage("🗑️ Đã xóa tin nhắn trên màn hình.");
      }
    },
    onChangeBackground: (bg) => {
      const validBgs = ['default', 'office', 'scifi', 'anime_room'];
      const nextBg = validBgs.includes(bg) ? bg : 'default';
      handleSaveSettings({ ...settings, auraBackground: nextBg });
      setToastMessage(`🖼️ Đã đổi hình nền sang: ${nextBg}`);
    },
    onCloseSettings: () => {
      setIsSettingsOpen(false);
      setToastMessage('✅ Đã đóng cài đặt.');
    }
  });

  const processedHistoryLengthRef = useRef(0);
  const gemini = {
    state, videoState, setVideoState, isDeepSleep, setIsDeepSleep,
    connect, disconnect, active, error, clearError, liveTranscript,
    mode, setMode, history: hookHistory, volume, sendText, sendScreenFrame,
    toggleMic, toggleSpeaker, toggleSpeakerAndReconnect, toggleLiveChat, pausePlayback, resumePlayback,
    pauseListening, resumeListening, meetingNotes, clearMeetingNotes, removeMeetingNote, togglePinNote,
  };

  // ── Consciousness Loop ────────────────────────────────────
  useEffect(() => {
    if (gemini.active && gemini.sendText) {
      const loop = new ConsciousnessLoop(gemini.sendText, () => !!gemini.active);
      loop.start();
      consciousnessRef.current = loop;
    } else {
      consciousnessRef.current?.stop();
      consciousnessRef.current = null;
    }
    return () => {
      consciousnessRef.current?.stop();
      consciousnessRef.current = null;
    };
  }, [gemini.active]);

  // ── Mic / Speaker ─────────────────────────────────────────
  useEffect(() => { gemini.toggleMic?.(isMicMuted); }, [isMicMuted, gemini.toggleMic]);
  // Speaker mute: reconnect with TEXT modality when muted
  useEffect(() => {
    if (gemini.active) {
      gemini.toggleSpeakerAndReconnect?.(isSpeakerMuted);
    } else {
      gemini.toggleSpeaker?.(isSpeakerMuted);
    }
  }, [isSpeakerMuted]);

  // ── Sync history to sessions ──────────────────────────────
  useEffect(() => {
    if (!gemini.active) { processedHistoryLengthRef.current = 0; return; }
    if (!currentSessionId) return;
    const newCount = hookHistory.length - processedHistoryLengthRef.current;
    if (newCount > 0) {
      const newMsgs = hookHistory.slice(processedHistoryLengthRef.current);
      setSessions(prev => prev.map(s => {
        if (s.id !== currentSessionId) return s;
        const updatedMessages = [...s.messages, ...newMsgs];
        let updatedTitle = s.title;
        if (s.title === "Đoạn chat mới") {
          const aiIdx = updatedMessages.findIndex(m => m.role === "model");
          if (aiIdx !== -1) {
            const t = updatedMessages[aiIdx].text;
            updatedTitle = t.substring(0, 40).replace(/["*_]/g, "") + (t.length > 40 ? "..." : "");
          }
        }
        return { ...s, messages: updatedMessages, updatedAt: Date.now(), title: updatedTitle };
      }));
      processedHistoryLengthRef.current = hookHistory.length;
    }
  }, [hookHistory, gemini.active, currentSessionId]);

  // ── Error handling ────────────────────────────────────────
  const clearApiKeyInStorage = useCallback(() => {
    setSettings(prev => {
      const updated = { ...prev, apiKey: "" };
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(updated));
      localStorage.removeItem(STORAGE_KEYS.legacySettings);
      return updated;
    });
    setApiKeyReady(false);
  }, []);

  useEffect(() => {
    if (gemini.error) {
      let msg = gemini.error;
      if (gemini.error.includes("entity was not found") || gemini.error.includes("404")) {
        msg = "Lỗi kết nối Model (404). Hãy thử lại hoặc kiểm tra VPN/Mạng.";
        setToastAction(undefined);
      } else if (gemini.error.includes("Key") || gemini.error.includes("403") || gemini.error.includes("Permission")) {
        msg = "API Key không hợp lệ hoặc hết hạn.";
        clearApiKeyInStorage();
        setToastAction(() => () => setIsSettingsOpen(true));
      } else if (gemini.error.includes("Lỗi mạng") || gemini.error.includes("Network Error")) {
        msg = "Không thể kết nối. Vui lòng kiểm tra mạng.";
        setToastAction(undefined);
      }
      setToastMessage(msg);
    }
  }, [gemini.error, clearApiKeyInStorage]);

  useEffect(() => {
    if (!notification) return;
    setToastMessage(notification);
    setToastAction(undefined);
    clearNotification();
  }, [notification, clearNotification]);

  // ── Session helpers ───────────────────────────────────────
  const handleCreateSession = () => {
    const s: ChatSession = {
      id: generateId(), title: "Đoạn chat mới", messages: [],
      createdAt: Date.now(), updatedAt: Date.now(), isPinned: false,
    };
    setSessions(prev => [s, ...prev]);
    setCurrentSessionId(s.id);
    return s.id;
  };

  const handleStartConnection = () => {
    if (!currentSessionId) {
      pendingConnectAfterSessionRef.current = true;
      handleCreateSession();
      return;
    }
    processedHistoryLengthRef.current = 0;
    gemini.connect();
  };

  useEffect(() => {
    if (!pendingConnectAfterSessionRef.current || !currentSessionId) return;
    pendingConnectAfterSessionRef.current = false;
    processedHistoryLengthRef.current = 0;
    gemini.connect();
  }, [currentSessionId, gemini.connect]);

  // ── Main action ───────────────────────────────────────────
  const handleMainAction = async () => {
    if (gemini.active) { gemini.disconnect(); setIsLiveMode(false); return; }
    const hasLocalKey = settings.apiKey && settings.apiKey.length > 10;
    const hasEnvKey = !!process.env.API_KEY;
    if (!hasLocalKey && !hasEnvKey) {
      if (window.aistudio && typeof window.aistudio.openSelectKey === "function") {
        try {
          await window.aistudio.openSelectKey();
          setApiKeyReady(true);
          setTimeout(() => handleStartConnection(), 500);
        } catch {
          setToastMessage("Bạn cần chọn API Key.");
          setIsSettingsOpen(true);
        }
        return;
      }
      setToastMessage("Chưa có API Key.");
      setIsSettingsOpen(true);
      return;
    }
    handleStartConnection();
  };

  const handleSaveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    const toSave = { ...newSettings };
    if (toSave.apiKey) toSave.apiKey = encryptKey(toSave.apiKey);
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(toSave));
    localStorage.removeItem(STORAGE_KEYS.legacySettings);
    if (gemini.active) {
      gemini.disconnect();
      setToastMessage(`Đã lưu cài đặt. Hãy khởi động lại ${assistantName}.`);
    }
  };

  const handleSetMode = (newMode: AppMode) => {
    if (gemini.mode === newMode) return;
    gemini.setMode(newMode);
    setToastMessage(`Đã chuyển sang: ${newMode === "translator" ? "Phiên dịch" : `Trợ lý ảo ${assistantName}`}. Đang kết nối lại...`);
    
    if (gemini.active) {
      gemini.disconnect();
      setTimeout(() => {
        gemini.connect();
        if (isLiveMode) {
          setTimeout(() => {
            gemini.toggleLiveChat?.(true);
          }, 1000);
        }
      }, 500);
    }
  };

  const handleToggleLive = () => {
    const next = !isLiveMode;
    setIsLiveMode(next);
    gemini.toggleLiveChat?.(next);
    setToastMessage(next ? "Đã bật chế độ trò chuyện trực tiếp (Live Chat)" : "Đã tắt Live Chat");
  };

  const handleToggleFeatureToolbar = () => {
    setIsFeatureToolbarOpen(prev => {
      const next = !prev;
      setFeatureToolbarSpin(next ? "cw" : "ccw");
      return next;
    });
  };

  const handleTogglePause = () => {
    if (!isPaused) {
      gemini.pausePlayback?.();
      setIsPaused(true);
      setToastMessage("Aura đã tạm dừng — hãy nói thêm nội dung của bạn!");
    } else {
      gemini.resumePlayback?.();
      setIsPaused(false);
      setToastMessage("Tiếp tục nghe Aura...");
    }
  };

  const handleToggleListening = () => {
    if (!isListeningPaused) {
      gemini.pauseListening?.();
      setIsListeningPaused(true);
      setToastMessage("⏸ Tạm dừng lắng nghe — môi trường đang yên tĩnh...");
    } else {
      gemini.resumeListening?.();
      setIsListeningPaused(false);
      setToastMessage("🎤 Đã bắt đầu lắng nghe trở lại!");
    }
  };

  const handleToggleMeetingMode = (forceEnable?: boolean) => {
    if (!gemini.active) {
      setToastMessage('⚠️ Hãy bắt đầu trò chuyện trước khi bật chế độ Ghi chú.');
      return;
    }
    const next = forceEnable !== undefined ? forceEnable : !isMeetingMode;
    if (next === isMeetingMode) return;
    setIsMeetingMode(next);
    if (next) {
      gemini.setMode('meeting');
      setIsSpeakerMuted(true);
      setToastMessage('📋 Meeting Mode: Aura đang quan sát và ghi chú cuộc họp...');
    } else {
      // Auto-save meeting notes before clearing
      if (gemini.meetingNotes && gemini.meetingNotes.length > 0) {
        meetingHistoryService.saveSession(gemini.meetingNotes);
        setHistoryRefreshKey(prev => prev + 1);
        setToastMessage('💾 Đã lưu phiên ghi chú vào lịch sử.');
      }
      gemini.setMode('assistant');
      setIsSpeakerMuted(false);
    }

    // Must reconnect to apply new System Prompt & Tools for Meeting Mode
    if (gemini.active) {
      gemini.disconnect();
      setTimeout(() => {
        gemini.connect();
        // Meeting mode MUST always activate mic to listen to the environment.
        const shouldActivateMic = next || isLiveMode;
        if (shouldActivateMic) {
          setTimeout(() => {
            gemini.toggleLiveChat?.(true);
            if (next) setIsLiveMode(true);
          }, 1000);
        }
      }, 500);
    }
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !gemini.active) return;
    if (!isSpeakerMuted && !isMeetingMode) {
      setIsSpeakerMuted(true);
      setToastMessage("🔇 Chế độ Yên Tĩnh: Aura sẽ chỉ trả lời bằng chữ.");
    }
    gemini.sendText?.(inputText);
    consciousnessRef.current?.recordUserActivity();
    setInputText("");
  };

  // ── PIP Handler ───────────────────────────────────────────
  const handleTogglePIP = async () => {
    if (isPIPActive) {
      pipWindowRef.current?.close();
      pipWindowRef.current = null;
      setIsPIPActive(false);
      return;
    }
    if (!('documentPictureInPicture' in window)) {
      setToastMessage('⚠️ PIP chỉ hỗ trợ trên Chrome 116+. Hãy dùng Chrome mới nhất!');
      return;
    }
    try {
      const pipWin = await (window as any).documentPictureInPicture.requestWindow({ width: 360, height: 540, disallowReturnToOpener: false });
      pipWindowRef.current = pipWin;
      setIsPIPActive(true);

      // Inject custom styles for dark premium PIP
      const pipStyle = pipWin.document.createElement('style');
      pipStyle.textContent = `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          width: 100%; height: 100vh; overflow: hidden;
          background: linear-gradient(145deg, #0a0a0f 0%, #12121a 40%, #0d0d14 100%);
          display: flex; align-items: flex-end; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .pip-video-wrap {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .pip-video-wrap video {
          width: 100%; height: 100%; object-fit: contain;
          filter: drop-shadow(0 0 30px rgba(120, 80, 255, 0.15));
        }
        .pip-gradient-top {
          position: absolute; top: 0; left: 0; right: 0; height: 80px; z-index: 2;
          background: linear-gradient(to bottom, rgba(0,0,0,0.6), transparent);
          pointer-events: none;
        }
        .pip-gradient-bottom {
          position: absolute; bottom: 0; left: 0; right: 0; height: 80px; z-index: 2;
          background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
          pointer-events: none;
        }
        .pip-brand {
          position: absolute; top: 12px; left: 14px; z-index: 3;
          display: flex; align-items: center; gap: 8px;
          pointer-events: none;
        }
        .pip-brand-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #a78bfa;
          box-shadow: 0 0 10px rgba(167,139,250,0.8);
          animation: pip-pulse 2s ease-in-out infinite;
        }
        .pip-brand-text {
          font-size: 11px; font-weight: 700; letter-spacing: 0.15em;
          text-transform: uppercase; color: rgba(255,255,255,0.7);
          text-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }
        .pip-status {
          position: absolute; bottom: 10px; left: 0; right: 0; z-index: 3;
          text-align: center; pointer-events: none;
        }
        .pip-status span {
          font-size: 10px; font-weight: 600; letter-spacing: 0.2em;
          text-transform: uppercase; color: rgba(255,255,255,0.4);
        }
        @keyframes pip-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `;
      pipWin.document.head.appendChild(pipStyle);

      // Build PIP DOM
      const wrap = pipWin.document.createElement('div');
      wrap.className = 'pip-video-wrap';

      const canvas = live2dContainerRef.current?.querySelector('canvas');
      if (canvas) {
        const stream = (canvas as any).captureStream(30);
        const video = pipWin.document.createElement('video');
        video.srcObject = stream; video.autoplay = true; video.muted = true;
        wrap.appendChild(video);
      }
      pipWin.document.body.appendChild(wrap);

      // Top gradient + branding
      const gradTop = pipWin.document.createElement('div');
      gradTop.className = 'pip-gradient-top';
      pipWin.document.body.appendChild(gradTop);

      const brand = pipWin.document.createElement('div');
      brand.className = 'pip-brand';
      brand.innerHTML = `<div class="pip-brand-dot"></div><span class="pip-brand-text">${assistantName}</span>`;
      pipWin.document.body.appendChild(brand);

      // Bottom gradient + status
      const gradBottom = pipWin.document.createElement('div');
      gradBottom.className = 'pip-gradient-bottom';
      pipWin.document.body.appendChild(gradBottom);

      const status = pipWin.document.createElement('div');
      status.className = 'pip-status';
      status.innerHTML = `<span>Pop-out Mode</span>`;
      pipWin.document.body.appendChild(status);

      pipWin.addEventListener('pagehide', () => { pipWindowRef.current = null; setIsPIPActive(false); });
      setToastMessage('✅ Aura đang chạy ở chế độ Pop-out! Thu nhỏ tab này để tiếp tục làm việc.');
    } catch (err) {
      console.error('[PIP] Error:', err);
      setToastMessage('Không thể bật chế độ Pop-out. Vui lòng thử lại.');
      setIsPIPActive(false);
    }
  };

  // ── Resolved model url ────────────────────────────────────
  const resolvedModelUrl = (() => {
    const char = settings.avatarCharacter || 'haru';
    if (char === 'custom') return settings.live2dModelUrl || CHARACTER_MODELS.haru.url;
    return CHARACTER_MODELS[char]?.url || CHARACTER_MODELS.haru.url;
  })();

  // ── Auto-scroll ───────────────────────────────────────────
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const displayMessages: ChatMessage[] = currentSession ? currentSession.messages : [];
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, gemini.liveTranscript, currentSessionId, gemini.active]);

  // ── Theme ─────────────────────────────────────────────────
  const themeClasses: Record<string, string> = {
    dark: "bg-[#0a0a0a] text-white",
    light: "bg-gray-100 text-neutral-900 border-gray-300",
    midnight: "bg-[#020617] text-blue-100",
    cyberpunk: "bg-[#050505] text-[#00ffcc]",
  };
  const currentTheme = settings.appTheme || 'dark';

  const bgClasses: Record<string, string> = {
    default: "",
    office: "bg-[url('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80')] bg-cover bg-center",
    scifi: "bg-[url('https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80')] bg-cover bg-center",
    anime_room: "bg-[url('https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&q=80')] bg-cover bg-center",
  };
  const bgClass = bgClasses[settings.auraBackground || 'default'];

  // ============================================================
  // RENDER — WEB DUAL PANE DASHBOARD
  // ============================================================
  // ── Auth Gate (must be authenticated + approved before rendering main UI) ──
  if (authLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a1a] z-50">
        <div className="text-center">
          <img src="/aura_npc_logo.png" alt="Aura" className="w-16 h-16 mx-auto mb-4 rounded-2xl animate-pulse" />
          <p className="text-white/40 text-sm">Đang kiểm tra phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <LoginScreen
        platform="web"
        onLoginSuccess={(user) => { setAuthUser(user); memoryService.setUserId(user.uid); }}
      />
    );
  }

  if (!authUser.isApproved) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#111133] to-[#0a0a2a] z-50">
        <div className="w-full max-w-md mx-4">
          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Shield size={40} className="text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Tài khoản chờ phê duyệt</h2>
            <p className="text-white/60 text-sm leading-relaxed mb-6">
              Chào <strong className="text-white">{authUser.displayName}</strong>! Tài khoản của bạn đang chờ Admin kích hoạt.
            </p>
            <button
              onClick={async () => { await authService.logout(); setAuthUser(null); memoryService.setUserId(null); }}
              className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm transition-all flex items-center gap-2 mx-auto"
            >
              <LogOut size={14} /> Đăng xuất
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Audio Permission Gate (must be unlocked before rendering main UI) ──
  if (!audioUnlocked) {
    return (
      <AudioPermissionGate
        onGranted={() => setAudioUnlocked(true)}
        assistantName={assistantName}
      />
    );
  }

  return (
    <div className={`h-[100dvh] w-screen ${themeClasses[currentTheme]} overflow-hidden font-sans select-none relative ${bgClass ? bgClass : 'bg-neutral-950'}`}>

      {/* ── Background Mesh & Gradients ── */}
      {!bgClass && !optimizeForCoverage && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
          <div className={`absolute top-[-10%] left-[-10%] w-[60%] h-[60%] blur-[120px] rounded-full mix-blend-screen transition-all duration-700 ease-in-out ${gemini.mode === "translator" ? "bg-blue-900/20" : gemini.state === EyeState.THINKING ? "bg-amber-700/20" : "bg-purple-900/20"}`} />
          <div className={`absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] blur-[120px] rounded-full mix-blend-screen transition-all duration-700 ease-in-out ${gemini.mode === "translator" ? "bg-cyan-900/20" : gemini.state === EyeState.THINKING ? "bg-orange-700/20" : "bg-pink-900/20"}`} />
        </div>
      )}

      {/* ── Full Screen Avatar ── */}
      <div
        ref={live2dContainerRef}
        className="absolute top-0 left-0 bottom-0 z-0 flex items-center justify-center cursor-pointer transition-transform duration-500 hover:scale-[1.03] w-full lg:w-[calc(100%-440px)]"
        onClick={handleMainAction}
      >
        <Suspense fallback={<div className="text-xs tracking-widest uppercase text-neutral-400 font-medium">✨ Loading Live2D...</div>}>
          <Live2DAvatar state={gemini.state} mode={gemini.mode} volume={gemini.active ? gemini.volume : 0} modelUrl={resolvedModelUrl} />
        </Suspense>
      </div>

      {/* ── Utilities overlays ── */}
      <Toast
        message={gemini.error ? (gemini.error.includes("entity was not found") ? "Lỗi Model. Reset Key..." : toastMessage || gemini.error) : toastMessage}
        onClose={() => { gemini.clearError(); clearNotification(); setToastMessage(null); setToastAction(undefined); }}
        onClick={toastAction}
      />
      {gemini.isDeepSleep && <AODDisplay onWake={() => gemini.setIsDeepSleep(false)} />}
      <VideoPlayer state={gemini.videoState} onClose={() => gemini.setVideoState(prev => ({ ...prev, isOpen: false }))} />
      {documentData && <DocumentPanel document={documentData} onClose={clearDocument} />}


      {/* ── Header Layer ── */}
      <header className="absolute top-0 left-0 right-0 p-5 lg:px-10 py-6 flex items-start justify-between z-20 bg-gradient-to-b from-black/60 via-black/20 to-transparent pointer-events-none">
        
        {/* Brand & Status */}
        <div className="pointer-events-auto flex items-center gap-3">
          <img src="/aura_npc_logo.png" alt="Aura" className="w-12 h-12 rounded-[1.25rem] border border-white/20 shadow-2xl object-cover bg-black/30 backdrop-blur-xl" />
          <div>
            <h1 className="text-xl font-bold tracking-widest text-white drop-shadow-lg">
              {assistantName}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${apiKeyReady ? (gemini.active ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" : "bg-neutral-400") : "bg-red-500"}`} />
              <p className="text-[10px] text-white/70 uppercase tracking-widest font-semibold">
                {apiKeyReady ? (gemini.active ? "Online" : "Standby") : "API Key Required"}
              </p>
            </div>
          </div>
        </div>
        
        {/* Top Right Controls */}
        <div className="pointer-events-auto flex flex-col md:flex-row items-end gap-3">
          {gemini.active && (
            <div className="flex items-center gap-2 px-1 py-1 mr-2">
              <AuraEmotionSticker
                state={gemini.state}
                active={gemini.active}
                variant="badge"
                name={assistantName}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            {/* Admin button (only for admins) */}
            {authUser?.role === 'admin' && (
              <button onClick={() => setIsAdminOpen(true)} className="w-10 h-10 rounded-full bg-purple-500/20 backdrop-blur-xl border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 flex items-center justify-center transition-all shadow-xl hover:scale-110" title="Quản lý người dùng">
                <Shield size={16} />
              </button>
            )}
            <button onClick={handleTogglePIP} className={`w-10 h-10 rounded-full backdrop-blur-xl border border-white/10 flex items-center justify-center transition-all shadow-xl hover:scale-110 ${isPIPActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-black/40 text-white/70 hover:bg-white/10 hover:text-white'}`} title="Thu nhỏ PIP">
              {isPIPActive ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 text-white/70 hover:bg-white/10 hover:text-white flex items-center justify-center transition-all shadow-xl hover:scale-110" title="Cài đặt">
              <SettingsIconSVG />
            </button>
            {/* Logout button */}
            <button
              onClick={async () => { await authService.logout(); setAuthUser(null); memoryService.setUserId(null); }}
              className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 text-white/40 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 flex items-center justify-center transition-all shadow-xl hover:scale-110"
              title="Đăng xuất"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Floating Dashboard: Chat + Meeting Notes ── */}
      <div className={`absolute bottom-4 right-4 lg:top-28 lg:bottom-12 lg:right-12 max-h-[80vh] z-20 flex gap-4 pointer-events-none drop-shadow-2xl transition-all duration-300 ${isMeetingMode ? 'w-[calc(100%-2rem)] lg:w-[760px]' : 'w-[calc(100%-2rem)] lg:w-[420px]'}`}>
        
        {/* Chat Card */}
        <div className="pointer-events-auto flex-1 w-full lg:w-[420px] shrink-0 bg-black/30 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] flex flex-col overflow-hidden will-change-transform shadow-[0_30px_60px_#00000080,inset_0_1px_0_rgba(255,255,255,0.2)]">
          
          {/* Chat Card Header — Mode Toggle + Utility Buttons */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/5">
            {/* Left: Current mode label */}
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
              {gemini.mode === "translator" ? "Phiên dịch" : "Trò chuyện"}
            </span>

            {/* Right: Utility buttons row */}
            <div className="flex items-center gap-1">
              {/* Clear messages */}
              <button
                onClick={() => {
                  if (currentSessionId) {
                    setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [] } : s));
                    setToastMessage('🗑️ Đã xóa tin nhắn.');
                  }
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="Xóa tin nhắn"
              >
                <Trash2 size={14} />
              </button>

              {/* Cycle background */}
              <button
                onClick={() => {
                  const bgKeys = Object.keys(bgClasses);
                  const currentIdx = bgKeys.indexOf(settings.auraBackground || 'default');
                  const nextIdx = (currentIdx + 1) % bgKeys.length;
                  const nextBg = bgKeys[nextIdx];
                  handleSaveSettings({ ...settings, auraBackground: nextBg });
                  const bgLabels: Record<string, string> = { default: 'Mặc định', office: 'Văn phòng', scifi: 'Sci-Fi', anime_room: 'Anime Room' };
                  setToastMessage(`🖼️ Nền: ${bgLabels[nextBg] || nextBg}`);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-purple-300 hover:bg-purple-500/10 transition-all"
                title="Đổi hình nền"
              >
                <Image size={14} />
              </button>

              {/* Divider */}
              <div className="w-px h-4 bg-white/10 mx-1" />

              {/* Mode toggle */}
              <button onClick={() => handleSetMode(gemini.mode === "assistant" ? "translator" : "assistant")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105 border ${
                  gemini.mode === "translator"
                    ? "bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25"
                    : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/80"
                }`}>
                <Sparkles size={11} />
                <span>{gemini.mode === "translator" ? "→ Trợ lý" : "→ Phiên dịch"}</span>
              </button>

              {/* Divider */}
              <div className="w-px h-4 bg-white/10 mx-1" />

              {/* Meeting mode */}
              <button onClick={() => handleToggleMeetingMode()}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105 border ${
                  isMeetingMode
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                    : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/80"
                }`}>
                <FileText size={11} />
                <span>Ghi chú</span>
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pt-4 pb-4 space-y-6">
            {displayMessages.length === 0 && !gemini.liveTranscript && (
              <div className="h-full flex flex-col items-center justify-center gap-3 mt-6">
                {gemini.active ? (
                  <div className="flex flex-col items-center gap-3">
                    <AuraEmotionSticker
                      state={gemini.state}
                      active={gemini.active}
                      variant="badge"
                      name={assistantName}
                    />
                    <p className="text-[11px] text-white/30 tracking-wider">
                      {gemini.state === EyeState.LISTENING ? "Cứ nói tự nhiên nhé~" :
                       gemini.state === EyeState.THINKING ? "Đang xử lý câu trả lời..." :
                       gemini.state === EyeState.SPEAKING ? "Đang trả lời bạn..." :
                       "Nói gì đó để bắt đầu..."}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-white/50">
                    <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                      <Sparkles size={22} className="text-white/40" />
                    </div>
                    <p className="text-xs tracking-wider opacity-60">Nói gì đó đi...</p>
                  </div>
                )}
              </div>
            )}
            {displayMessages.map((msg, index) => (
              <div key={index} className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[85%] flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`relative px-5 py-3.5 text-[13px] leading-relaxed shadow-md backdrop-blur-md break-words ${msg.role === "user" ? "bg-white/10 text-white rounded-[1.5rem] rounded-tr-sm border border-white/10" : "bg-black/40 text-neutral-200 rounded-[1.5rem] rounded-tl-sm border border-black/20"}`}>
                    {msg.text}
                  </div>
                  {msg.originalText && (
                    <div className={`mt-1.5 text-[10px] text-white/40 italic px-3 ${msg.role === "user" ? "text-right" : "text-left"}`}>"{msg.originalText}"</div>
                  )}
                </div>
              </div>
            ))}
            {gemini.liveTranscript && (
              <div className={`flex w-full ${gemini.liveTranscript.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[85%] flex-col ${gemini.liveTranscript.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`relative px-5 py-3.5 text-[13px] leading-relaxed shadow-md backdrop-blur-md opacity-80 animate-pulse break-words ${gemini.liveTranscript.role === "user" ? "bg-white/10 text-white rounded-[1.5rem] rounded-tr-sm border border-white/10" : "bg-black/40 text-neutral-300 rounded-[1.5rem] rounded-tl-sm border border-black/20"}`}>
                    {gemini.liveTranscript.text}...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>

          {/* Dynamic Bottom Controls */}
          <div className="p-5 bg-gradient-to-t from-black/80 via-black/50 to-transparent flex flex-col gap-3">
            {!gemini.active ? (
              <button autoFocus onClick={handleMainAction}
                className="group relative w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5 backdrop-blur-lg hover:bg-white/10 transition-all duration-300 shadow-xl py-4 h-[60px] flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-center gap-2">
                  <Sparkles size={16} className={apiKeyReady ? "text-blue-300" : "text-neutral-500"} />
                  <span className={`text-[12px] font-bold tracking-[0.2em] uppercase ${apiKeyReady ? "text-white" : "text-neutral-500"}`}>
                    {apiKeyReady ? `Bắt đầu` : "Nhập API Key"}
                  </span>
                </div>
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Text Input Row */}
                <form onSubmit={handleSendMessage} className="relative flex items-center w-full">
                  <input
                    type="text" value={inputText} onChange={e => setInputText(e.target.value)}
                    placeholder="Gõ gì đó..."
                    className="w-full bg-black/50 backdrop-blur-md border border-white/10 rounded-[1.5rem] py-3.5 pl-5 pr-14 text-sm text-white focus:outline-none focus:border-white/30 transition-all shadow-inner"
                  />
                  <button type="submit" disabled={!inputText.trim()}
                    className="absolute right-2 p-2 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 text-white rounded-xl transition-colors">
                    <Send size={16} />
                  </button>
                </form>

                {/* Voice & Utility Controls Row */}
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <button onClick={handleToggleLive}
                      className={`w-12 h-12 flex items-center justify-center rounded-[1.25rem] transition-all shadow-lg backdrop-blur-md border ${isLiveMode ? "bg-red-500/80 hover:bg-red-500 border-red-500/50 text-white animate-pulse" : "bg-white/5 hover:bg-white/10 border-white/10 text-white/70"}`}
                      title={isLiveMode ? "Tắt Mic" : "Bật Mic"}>
                      <Mic size={20} />
                    </button>
                    <button onClick={() => setIsSpeakerMuted(!isSpeakerMuted)}
                      className={`w-12 h-12 flex items-center justify-center rounded-[1.25rem] transition-all border ${!isSpeakerMuted ? "bg-white/5 hover:bg-white/10 border-white/10 text-white/70" : "bg-orange-500/20 border-orange-500/40 text-orange-300"}`} title="Chế độ âm thanh">
                      {!isSpeakerMuted ? <Volume2 size={20} /> : <VolumeX size={20} />}
                    </button>
                    {isLiveMode && gemini.state === EyeState.SPEAKING && (
                      <button onClick={handleTogglePause}
                        className={`w-12 h-12 flex items-center justify-center rounded-[1.25rem] transition-all border ${isPaused ? "bg-green-500/20 text-green-300 border-green-500/40" : "bg-white/5 hover:bg-white/10 border-white/10 text-white/70"}`} title={isPaused ? "Phát tiếp" : "Khoan nói"}>
                        {isPaused ? <Mic size={20} /> : <Square size={20} />}
                      </button>
                    )}
                  </div>
                  
                  <button onClick={handleMainAction}
                    className="px-5 py-3 rounded-[1.25rem] flex items-center gap-2 transition-all bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 group">
                    <span className="w-2 h-2 rounded-sm bg-red-400 group-hover:scale-110 transition-transform"></span>
                    <span className="text-[10px] uppercase tracking-widest font-bold">Dừng</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Meeting Notes Sidebar (Web Version) */}
        {isMeetingMode && (
          <div className="hidden lg:flex w-[320px] shrink-0 pointer-events-auto items-stretch rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_30px_60px_#00000080,inset_0_1px_0_rgba(255,255,255,0.2)]">
            <MeetingNotesPanel
              notes={gemini.meetingNotes || []}
              isLive={gemini.active}
              onEndMeeting={() => {
                if (gemini.sendText) {
                  gemini.sendText("kết thúc cuộc họp");
                }
              }}
              onSummary={() => {
                if (gemini.sendText) {
                  gemini.sendText("tóm tắt đến giờ");
                }
              }}
              onClear={gemini.clearMeetingNotes}
              onRemoveNote={gemini.removeMeetingNote}
              onTogglePin={gemini.togglePinNote}
              onToast={(msg) => setToastMessage(msg)}
              historyRefreshKey={historyRefreshKey}
            />
          </div>
        )}
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onSave={handleSaveSettings} authUser={authUser} />
      <AdminPanel isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />
    </div>
  );
};

// ── Helper SVG Icons ──────────────────────────────────────────
const SettingsIconSVG = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default AppWeb;
