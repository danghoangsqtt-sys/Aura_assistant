/**
 * AppDesktop.tsx — Electron Floating Overlay UI
 *
 * Đây là UI dành riêng cho Electron App:
 * - Transparent floating window
 * - Drag-to-move (via platformBridge)
 * - Scroll-to-zoom avatar
 * - Radial menu control
 * - Screen Vision integration
 * - Hover-reveal controls
 *
 * KHÔNG có bất kỳ code Web-specific nào ở đây.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  Suspense,
} from "react";
import { Send, FileText } from "lucide-react";
import {
  UserSettings,
  EyeState,
  UserLocation,
  ChatSession,
  ChatMessage,
} from "../shared/types";
import ElectronSettings from "./components/ElectronSettings";
import VideoPlayer from "../shared/components/VideoPlayer";
import AODDisplay from "../shared/components/AODDisplay";
import Toast from "../shared/components/Toast";
import RadialMenu from "./components/RadialMenu";
import SplashScreen from "./components/SplashScreen";
import AuraEmotionSticker from "../shared/components/AuraEmotionSticker";
import DocumentPanel from "../shared/components/DocumentPanel";
import MeetingNotesPanel from "../shared/components/MeetingNotesPanel";
import { meetingHistoryService } from "../shared/services/meetingHistoryService";

import { useGeminiLive } from "../shared/hooks/useGeminiLive";
import { encryptKey, decryptKey } from "../shared/utils/crypto";
import { CHARACTER_MODELS, DEFAULT_CHARACTER_ID } from "../shared/constants/characters";
import { ConsciousnessLoop } from "../shared/services/consciousnessLoop";
import { platform } from "../shared/platformBridge";
import { cameraVisionService } from "./services/CameraVisionService";
import { presentationService } from "./services/presentationService";

import AudioPermissionGate from "../webapp/components/AudioPermissionGate";

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
  liveModel: 'gemini-2.5-flash-preview-native-audio-dialog',
};

const STORAGE_KEYS = {
  settings: "aura_settings",
  sessions: "aura_sessions",
  legacySettings: "nana_settings",
  legacySessions: "nana_sessions",
} as const;

const Live2DAvatar = React.lazy(() => import("../shared/components/Live2DAvatar"));

const generateId = () => Math.random().toString(36).substr(2, 9);

const AppDesktop: React.FC = () => {
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

  // ── Session Management ────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved =
      localStorage.getItem(STORAGE_KEYS.sessions) ||
      localStorage.getItem(STORAGE_KEYS.legacySessions);
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // ── Splash Screen (chỉ hiện 1 lần khi khởi động) ──────────
  const [splashDone, setSplashDone] = useState(false);

  // ── Audio Permission Gate ─────────────────────────────────
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // ── UI State ──────────────────────────────────────────────
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<(() => void) | undefined>(undefined);
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [inputText, setInputText] = useState("");


  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isRadialMenuOpen, setIsRadialMenuOpen] = useState(false);
  const [isScreenVisionOn, setIsScreenVisionOn] = useState(false);
  const [isCameraVisionOn, setIsCameraVisionOn] = useState(false);
  const [isMeetingMode, setIsMeetingMode] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [presentationSlideCount, setPresentationSlideCount] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const screenVisionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraVisionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevScreenFrameRef = useRef<string | null>(null); // For slide-change detection
  const consciousnessRef = useRef<ConsciousnessLoop | null>(null);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const pendingConnectAfterSessionRef = useRef(false);
  const live2dContainerRef = useRef<HTMLDivElement | null>(null);

  // ── Avatar Scale (scroll-to-zoom) ─────────────────────────
  const [avatarScale, setAvatarScale] = useState(() => {
    const saved = localStorage.getItem('aura_avatarScale');
    return saved ? parseFloat(saved) : 1;
  });
  useEffect(() => {
    localStorage.setItem('aura_avatarScale', avatarScale.toString());
    document.documentElement.style.fontSize = `${avatarScale * 16}px`;
  }, [avatarScale]);

  // ── Apply electron body class ─────────────────────────────
  useEffect(() => {
    document.body.classList.add('is-electron');
    document.documentElement.classList.add('is-electron');
  }, []);



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

  // ── API Key check ─────────────────────────────────────────  // 🔒 API Key check 🔒
  useEffect(() => {
    const check = async () => {
      if ((settings.apiKey && settings.apiKey.length > 10) || process.env.API_KEY) {
        setApiKeyReady(true);
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

  // ── Settings handler ─────────────────────────────────────
  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setIsRadialMenuOpen(false);
  }, []);

  // ── Slide Change Detector ─────────────────────────────────────
  // Compares two base64 JPEG frames using sampled pixel brightness diff.
  // Returns true if more than 12% of sampled pixels changed significantly.
  const detectSlideChange = (prevBase64: string, currBase64: string): boolean => {
    try {
      // Quick length change check — different JPEG sizes usually mean content changed
      const lenDiff = Math.abs(prevBase64.length - currBase64.length);
      const lenRatio = lenDiff / Math.max(prevBase64.length, 1);
      if (lenRatio > 0.05) return true; // >5% size change → slide changed

      // Byte-level sampling: compare random positions in the base64 string
      const sampleCount = 200;
      let diffCount = 0;
      const step = Math.floor(Math.min(prevBase64.length, currBase64.length) / sampleCount);
      if (step < 1) return lenRatio > 0.02;

      for (let i = 0; i < sampleCount; i++) {
        const pos = i * step;
        if (prevBase64.charCodeAt(pos) !== currBase64.charCodeAt(pos)) {
          diffCount++;
        }
      }
      return (diffCount / sampleCount) > 0.12; // >12% of samples differ → slide changed
    } catch {
      return false;
    }
  };

  // ── Presentation Mode Toggle ─── [WIP — DISABLED] ────────────────────
  // Known bugs preventing release:
  //   BUG-P01: Voice "thuyết trình" triggers toggle_meeting_mode tool instead of presentation mode
  //            Root cause: user says it while in 'assistant' mode — Gemini picks meeting tool
  //            Fix needed: add a dedicated 'start_presentation' tool OR intercept voice intent
  //   BUG-P02: desktopCapturer returns black/white screen for PowerPoint Slideshow
  //            Root cause: PowerPoint uses DirectX hardware overlay — not captured by Electron APIs
  //            Fix needed: use Windows Graphics Capture API or mirror slide to secondary source
  //   BUG-P03: Slide Knowledge Base not loaded into Aura context
  //            Root cause: presentationKnowledge injected into effectiveSettings but only
  //            applied on reconnect — timing issue: reconnect happens before loadFromText() finishes
  //            Fix needed: await file read THEN set mode THEN reconnect (already partially done but order off)
  const handleTogglePresentationMode = async (_forceEnable?: boolean) => {
    // [DISABLED] Tính năng đang trong quá trình phát triển, chưa sẵn sàng.
    setToastMessage('🚧 Chế độ Thuyết trình đang được phát triển — chưa khả dụng.');
    // ─── Future implementation (preserved, do not delete) ───
    // const next = forceEnable !== undefined ? forceEnable : !isPresentationMode;
    // if (next === isPresentationMode) return;
    // if (next) {
    //   if (!gemini.active) { setToastMessage('⚠️ Hãy bắt đầu trò chuyện với Aura trước.'); return; }
    //   const filePath = settings.presentationFilePath;
    //   if (filePath) {
    //     setToastMessage('📖 Đang đọc tài liệu thuyết trình...');
    //     try {
    //       const result = await platform.readDocument({ path: filePath });
    //       if (result?.success && result.text) {
    //         const count = presentationService.loadFromText(result.text, filePath.split(/[\\/]/).pop() || filePath);
    //         setPresentationSlideCount(count);
    //         setToastMessage(`✅ Đã tải ${count} slides. Aura sẵn sàng thuyết trình!`);
    //       }
    //     } catch { setToastMessage('⚠️ Lỗi đọc file.'); }
    //   }
    //   setIsPresentationMode(true);
    //   prevScreenFrameRef.current = null;
    //   gemini.setMode('presentation');
    //   gemini.disconnect();
    //   setTimeout(() => { gemini.connect(); setTimeout(() => { gemini.sendText?.('...'); }, 2000); }, 600);
    // } else {
    //   setIsPresentationMode(false); prevScreenFrameRef.current = null;
    //   presentationService.clear(); setPresentationSlideCount(0);
    //   gemini.setMode('assistant'); setToastMessage('✅ Đã thoát chế độ thuyết trình.');
    //   if (gemini.active) { gemini.disconnect(); setTimeout(() => gemini.connect(), 500); }
    // }
  };


  // ── Gemini Live ───────────────────────────────────────
  // Merge live vision state into settings so system instruction knows which modes are active
  // presentationKnowledge is injected in-memory (NOT persisted to localStorage)
  const effectiveSettings = React.useMemo(() => ({
    ...settings,
    screenVisionEnabled: isScreenVisionOn,
    cameraVisionEnabled: isCameraVisionOn,
    presentationKnowledge: isPresentationMode ? presentationService.buildKnowledgeContext() : undefined,
  }), [settings, isScreenVisionOn, isCameraVisionOn, isPresentationMode]);

  const {
    state, videoState, setVideoState, isDeepSleep, setIsDeepSleep,
    connect, disconnect, active, error, clearError, liveTranscript,
    mode, setMode, history: hookHistory, volume, notification,
    clearNotification, sendText, sendScreenFrame, toggleMic, toggleSpeaker,
    toggleSpeakerAndReconnect,
    toggleLiveChat, pausePlayback, resumePlayback, pauseListening, resumeListening,
    requestMicStartAfterReconnect,
    documentData, clearDocument, meetingNotes, clearMeetingNotes, removeMeetingNote, togglePinNote,
  } = useGeminiLive(effectiveSettings, location, handleOpenSettings, {
    onToggleMute: (mute) => {
      setIsSpeakerMuted(mute);
      setToastMessage(mute ? "🔇 Đã tắt tiếng Aura." : "🔊 Đã bật tiếng Aura.");
    },
    onToggleScreenVision: (enable) => {
      setIsScreenVisionOn(enable);
      setToastMessage(enable ? "👁️ Aura đang theo dõi màn hình." : "🙈 Aura đã ngừng theo dõi màn hình.");
    },
    onToggleCameraVision: (enable) => {
      setIsCameraVisionOn(enable);
      setToastMessage(enable ? "📹 Aura đang nhìn qua camera." : "🚫 Aura đã tắt camera.");
    },
    onToggleMeetingMode: (enable) => handleToggleMeetingMode(enable),
    onClearChat: () => {
      if (currentSessionId) {
        setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [] } : s));
        setToastMessage("🗑️ Đã xóa tin nhắn trên màn hình.");
      }
    },
    onChangeBackground: (bg) => {
      setToastMessage("Đổi hình nền chỉ dành cho WebApp (Chế độ trong suốt không dùng nền).");
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
    toggleMic, toggleSpeaker, toggleSpeakerAndReconnect, meetingNotes, clearMeetingNotes, removeMeetingNote, togglePinNote,
    toggleLiveChat, pausePlayback, resumePlayback,
    pauseListening, resumeListening,
    requestMicStartAfterReconnect,
  };

  // ── Screen Vision Timer ───────────────────────────────────
  useEffect(() => {
    if (screenVisionTimerRef.current) {
      clearInterval(screenVisionTimerRef.current);
      screenVisionTimerRef.current = null;
    }
    // Presentation mode overrides screen vision even when toggle is off
    const visionActive = isScreenVisionOn || isPresentationMode;
    if (!visionActive || !gemini.active) return;

    // Presentation mode: capture every 2s to detect slide changes quickly
    // Normal mode: use user-configured interval
    const intervalSec = isPresentationMode ? 2 : (settings.screenVisionIntervalSec || 4);

    const captureAndSend = async () => {
      if (!gemini.active) return;
      try {
        const base64 = await platform.captureScreen();
        if (!base64) return;

        if (isPresentationMode) {
          // ── Slide Change Detection ──────────────────────────
          // Compare current frame vs previous frame using sampled pixel diff
          const prev = prevScreenFrameRef.current;
          prevScreenFrameRef.current = base64;

          if (prev && prev !== base64) {
            const changed = detectSlideChange(prev, base64);
            if (changed) {
              // Always send the new frame for Aura to see
              gemini.sendScreenFrame?.(base64);
              // Trigger Aura to narrate the new slide
              setTimeout(() => {
                gemini.sendText?.('[SLIDE_CHANGED] Slide mới vừa xuất hiện. Hãy nhìn vào ảnh màn hình mới nhất và thuyết trình nội dung slide này một cách tự nhiên, sinh động.');
              }, 300); // small delay to ensure frame arrives first
            }
          } else if (!prev) {
            // First frame — send immediately so Aura knows what slide 1 looks like
            gemini.sendScreenFrame?.(base64);
          }
        } else {
          // Normal screen vision: just send the frame
          gemini.sendScreenFrame?.(base64);
        }
      } catch (e) {
        console.warn('[ScreenVision] Capture failed:', e);
      }
    };
    captureAndSend();
    screenVisionTimerRef.current = setInterval(captureAndSend, intervalSec * 1000);
    return () => {
      if (screenVisionTimerRef.current) {
        clearInterval(screenVisionTimerRef.current);
        screenVisionTimerRef.current = null;
      }
    };
  }, [isScreenVisionOn, isPresentationMode, gemini.active]);

  // ── Camera Vision Timer ─────────────────────────────────────
  useEffect(() => {
    if (cameraVisionTimerRef.current) {
      clearInterval(cameraVisionTimerRef.current);
      cameraVisionTimerRef.current = null;
    }
    if (!isCameraVisionOn || !gemini.active) {
      // Stop camera if vision is turned off or disconnected
      if (!isCameraVisionOn && cameraVisionService.isActive) {
        cameraVisionService.stop();
      }
      return;
    }

    const intervalSec = settings.cameraVisionIntervalSec || 8;

    const startAndCapture = async () => {
      // Start camera if not already active
      if (!cameraVisionService.isActive) {
        const started = await cameraVisionService.start();
        if (!started) {
          setToastMessage('❌ Không thể truy cập Camera. Kiểm tra quyền truy cập.');
          setIsCameraVisionOn(false);
          return;
        }
      }

      // Capture and send first frame immediately
      const captureAndSend = () => {
        if (!gemini.active || !cameraVisionService.isActive) return;
        const base64 = cameraVisionService.captureFrame();
        if (base64) {
          gemini.sendScreenFrame?.(base64);
          console.log('[CameraVision] Frame sent to Gemini.');
        }
      };

      captureAndSend();
      cameraVisionTimerRef.current = setInterval(captureAndSend, intervalSec * 1000);
    };

    startAndCapture();

    return () => {
      if (cameraVisionTimerRef.current) {
        clearInterval(cameraVisionTimerRef.current);
        cameraVisionTimerRef.current = null;
      }
    };
  }, [isCameraVisionOn, gemini.active]);

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

  // ── Mic / Speaker Toggles ─────────────────────────────────
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
            const firstAiText = updatedMessages[aiIdx].text;
            updatedTitle = firstAiText.substring(0, 40).replace(/["*_]/g, "") + (firstAiText.length > 40 ? "..." : "");
          }
        }
        return { ...s, messages: updatedMessages, updatedAt: Date.now(), title: updatedTitle };
      }));
      processedHistoryLengthRef.current = hookHistory.length;
    }
  }, [hookHistory, gemini.active, currentSessionId]);

  // ── Error handling ────────────────────────────────────────
  useEffect(() => {
    if (gemini.error) {
      let msg = gemini.error;
      if (gemini.error.includes("entity was not found") || gemini.error.includes("404")) {
        msg = "Lỗi kết nối Model (404). Hãy thử lại hoặc kiểm tra VPN/Mạng.";
      } else if (gemini.error.includes("Key") || gemini.error.includes("403")) {
        msg = "API Key không hợp lệ hoặc hết hạn.";
        setToastAction(() => () => setIsSettingsOpen(true));
      }
      setToastMessage(msg);
    }
  }, [gemini.error]);

  useEffect(() => {
    if (!notification) return;
    setToastMessage(notification);
    setToastAction(undefined);
    clearNotification();
  }, [notification, clearNotification]);

  // ── Session helpers ───────────────────────────────────────
  const handleCreateSession = () => {
    const newSession: ChatSession = {
      id: generateId(), title: "Đoạn chat mới", messages: [],
      createdAt: Date.now(), updatedAt: Date.now(), isPinned: false,
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    return newSession.id;
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
    if (gemini.active) {
      gemini.disconnect();
      setIsLiveMode(false);
      // Cleanup camera vision on disconnect
      if (isCameraVisionOn) {
        setIsCameraVisionOn(false);
        cameraVisionService.stop();
      }
      return;
    }
    // Bắt đầu kết nối Gemini
    if (!apiKeyReady) { setToastMessage("Chưa có API Key."); setIsSettingsOpen(true); return; }
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

  const handleToggleLive = () => {
    const next = !isLiveMode;
    setIsLiveMode(next);
    gemini.toggleLiveChat?.(next);
    setToastMessage(next ? "Đã bật Live Chat" : "Đã tắt Live Chat");
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !gemini.active) return;
    // Don't auto-mute speaker when typing in meeting mode — meeting mode is already text-only
    if (!isSpeakerMuted && !isMeetingMode) { setIsSpeakerMuted(true); setToastMessage("🔇 Chế độ Yên Tĩnh"); }
    gemini.sendText?.(inputText);
    consciousnessRef.current?.recordUserActivity();
    setInputText("");
  };

  // ── Meeting Mode Toggle ──────────────────────────────────
  const handleToggleMeetingMode = (forceEnable?: boolean) => {
    if (!gemini.active) {
      setToastMessage('⚠️ Hãy bắt đầu trò chuyện trước khi bật Meeting Mode.');
      return;
    }
    const next = forceEnable !== undefined ? forceEnable : !isMeetingMode;
    if (next === isMeetingMode) return;
    setIsMeetingMode(next);
    if (next) {
      // Entering meeting mode: resize window and SAVE its position BEFORE expanding
      platform.resizeWindow(380 * avatarScale + 320, 600 * avatarScale, { anchorX: 'left', savePositionForRestore: true });
      gemini.setMode('meeting');
      setIsSpeakerMuted(true);
      setToastMessage('📋 Meeting Mode: Aura đang lắng nghe cuộc họp...');
    } else {
      // Exiting meeting mode: auto-save current notes before clearing
      if (gemini.meetingNotes && gemini.meetingNotes.length > 0) {
        meetingHistoryService.saveSession(gemini.meetingNotes);
        setHistoryRefreshKey(prev => prev + 1);
        setToastMessage('💾 Đã lưu phiên ghi chú vào lịch sử.');
      }
      // Switch back to assistant mode and RESTORE EXACT position
      platform.resizeWindow(380 * avatarScale, 600 * avatarScale, { restorePosition: true });
      gemini.setMode('assistant');
      setIsSpeakerMuted(false);
    }

    // Must reconnect to apply new System Prompt & Tools for Meeting Mode
    if (gemini.active) {
      gemini.disconnect();
      setTimeout(() => {
        gemini.connect();
        // Queue mic start on the NEW service — will auto-fire when session opens
        if (next) {
          // Small delay to let connect() create the new service first
          setTimeout(() => {
            gemini.requestMicStartAfterReconnect?.();
          }, 100);
        }
        // Fallback timer to ensure mic is definitely active
        const shouldActivateMic = next || isLiveMode;
        if (shouldActivateMic) {
          setTimeout(() => {
            gemini.toggleLiveChat?.(true);
            if (next) setIsLiveMode(true);
          }, 3000);
        }
      }, 500);
    }
  };

  // ── Global Keyboard Shortcuts ──────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is actively typing in input, UNLESS it's a Function key
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA' || 
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        if (!e.key.match(/^F[1-6]$/)) return;
      }

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          handleMainAction();
          break;
        case 'F2':
          e.preventDefault();
          handleToggleLive();
          break;
        case 'F3':
          e.preventDefault();
          setIsSpeakerMuted(prev => !prev);
          break;
        case 'F4':
          e.preventDefault();
          handleToggleMeetingMode();
          break;
        case 'F6':
          e.preventDefault();
          setIsSettingsOpen(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }); // Run every render to closure capture the latest functions

  // ── Resolved model url ────────────────────────────────────
  const resolvedModelUrl = (() => {
    const char = settings.avatarCharacter || 'haru';
    if (char === 'custom') return settings.live2dModelUrl || CHARACTER_MODELS.haru.url;
    return CHARACTER_MODELS[char]?.url || CHARACTER_MODELS.haru.url;
  })();

  // ── Electron drag ─────────────────────────────────────────
  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    platform.startDrag({ x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleChatDragDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('form')) return;
    handlePointerDown(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 5 || dy > 5) {
      isDraggingRef.current = true;
      platform.doDrag();
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    platform.stopDrag();
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!isDraggingRef.current) {
      setIsRadialMenuOpen(prev => !prev);
    }
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    setAvatarScale(prev => {
      let next = prev;
      if (e.deltaY < 0) next = Math.min(prev * 1.05, 2.0);
      else next = Math.max(prev * 0.95, 0.4);
      if (next !== prev) platform.resizeWindow(380 * next, 600 * next);
      return next;
    });
  };

  // ── Auto-resize window on settings open (Moved to handleOpenSettings/handleCloseSettings) ─

  // ── Display messages ──────────────────────────────────────
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const displayMessages: ChatMessage[] = currentSession ? currentSession.messages : [];

  // ============================================================
  // RENDER — ELECTRON FLOATING UI
  // ============================================================
  


  // Phase 0: Splash Screen (intro + game loading)
  if (!splashDone) {
    return <SplashScreen onComplete={() => setSplashDone(true)} />;
  }

  // Phase 1: Audio Permission Gate (xin quyền Mic + AudioContext)
  if (!audioUnlocked) {
    return <AudioPermissionGate onGranted={() => setAudioUnlocked(true)} assistantName={assistantName} />;
  }

  return (
    <div className="group h-screen w-screen bg-transparent flex flex-row overflow-hidden font-sans select-none relative">
      <div 
        className="relative h-full transition-all duration-300 flex flex-col items-center justify-end"
        style={{ width: isMeetingMode ? 'calc(100% - 320px)' : '100%' }}
      >
        {/* Modern Hover Border Overlay */}
        <div className="absolute inset-0 z-[-1] pointer-events-none rounded-3xl border-2 border-white/0 group-hover:border-white/20 bg-black/0 transition-all duration-500 shadow-none group-hover:shadow-[0_0_40px_rgba(255,255,255,0.05)]" />

        {/* Drag Handle Top Bar */}
        <div
          className="absolute top-2 left-0 w-full h-10 z-[100] flex justify-between items-center px-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          <div className="flex-1 h-full flex items-center justify-center">
            <div className="w-20 h-2 bg-white/40 shadow-lg rounded-full" />
          </div>
          <button
            onClick={() => platform.closeWindow()}
            className="w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors cursor-pointer shadow-lg"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <span className="text-[10px] font-bold">✕</span>
          </button>
        </div>

        {/* Emotion badge — riêng biệt, bên dưới drag bar, không ảnh hưởng AppRegion */}
        {gemini.active && (
          <div
            className="absolute top-12 left-1/2 -translate-x-1/2 z-[90] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <AuraEmotionSticker
              state={gemini.state}
              active={gemini.active}
              variant="badge"
              name={assistantName}
            />
          </div>
        )}

        {/* Meeting Mode Badge Indicator */}
        {isMeetingMode && gemini.active && (
          <div className="absolute top-3 left-3 z-[95] pointer-events-none">
            <div className="flex items-center gap-1.5 bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 rounded-full px-3 py-1.5 shadow-lg">
              <FileText size={12} className="text-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider animate-pulse">Meeting</span>
            </div>
          </div>
        )}

        {/* Global Toast */}
        <Toast
          message={gemini.error ? (gemini.error.includes("entity was not found") ? "Lỗi Model. Reset Key..." : toastMessage || gemini.error) : toastMessage}
          onClose={() => { gemini.clearError(); clearNotification(); setToastMessage(null); setToastAction(undefined); }}
          onClick={toastAction}
        />

        {/* Deep Sleep AOD */}
        {gemini.isDeepSleep && <AODDisplay onWake={() => gemini.setIsDeepSleep(false)} />}

        {/* Video / Music Player */}
        <VideoPlayer
          state={gemini.videoState}
          onClose={() => gemini.setVideoState(prev => ({ ...prev, isOpen: false }))}
        />
        {documentData && <DocumentPanel document={documentData} onClose={clearDocument} />}

        {/* Live2D Character (Full Window) */}
        <div className="absolute inset-0 z-0 flex items-end justify-center pointer-events-auto">
          <div
            ref={live2dContainerRef}
            className="w-full h-full flex items-end justify-center transition-transform duration-500 hover:scale-[1.02]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            style={{
              WebkitAppRegion: 'no-drag',
              cursor: isDraggingRef.current ? 'grabbing' : 'grab'
            } as any}
          >
            <Suspense fallback={null}>
              <Live2DAvatar state={gemini.state} mode={gemini.mode} volume={gemini.active ? gemini.volume : 0} modelUrl={resolvedModelUrl} />
            </Suspense>
          </div>
        </div>

        {/* ── Aura Response Subtitle (Global Hover to hide when mouse leaves) ── */}
        {gemini.active && (gemini.liveTranscript?.role === 'model' || displayMessages.some(m => m.role === 'model')) && (() => {
          const lastAuraMsg = gemini.liveTranscript?.role === 'model'
            ? gemini.liveTranscript.text
            : [...displayMessages].reverse().find(m => m.role === 'model')?.text;
          return lastAuraMsg ? (
            <div className="absolute top-14 left-0 right-0 z-[85] px-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="mx-auto w-[85%] max-w-[85%] bg-black/60 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-2.5 shadow-2xl">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                  <span className="text-[9px] uppercase tracking-widest text-purple-300 font-bold">{settings.assistantName || 'Aura'}</span>
                  {gemini.state === EyeState.SPEAKING && <span className="text-[9px] text-purple-300/60 animate-pulse">đang nói...</span>}
                </div>
                <p className="text-xs text-neutral-100 leading-relaxed">{lastAuraMsg}</p>
              </div>
            </div>
          ) : null;
        })()}

        {/* ── User Chat & Input (Hover Bottom 30% to reveal) ── */}
        {gemini.active && (
          <div 
            className="absolute bottom-0 left-0 right-0 h-[30%] z-[80] group/bottom flex flex-col justify-end pb-6"
            onPointerDown={handleChatDragDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Livestream-style User Chat Overlay */}
            {displayMessages.some(m => m.role === 'user') && (
              <div className="px-6 mb-2 pointer-events-none flex flex-col justify-end gap-1.5 opacity-0 group-hover/bottom:opacity-100 transition-opacity duration-300">
                {displayMessages.filter(m => m.role === 'user').slice(-1).map((msg, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider">{settings.userName}</span>
                    <span className="text-xs text-white bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl rounded-tl-sm w-fit max-w-[250px] shadow-md border border-white/10 break-words">
                      {msg.text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Desktop Chat Input */}
            <div className="px-6 pointer-events-auto opacity-0 group-hover/bottom:opacity-100 transition-opacity duration-300" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <form onSubmit={handleSendMessage} className="relative flex items-center shadow-2xl shadow-black/50">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Nhập tin nhắn..."
                  className="w-full bg-black/60 backdrop-blur-xl border border-white/20 hover:border-purple-500/50 rounded-full py-2.5 pl-4 pr-10 text-xs text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="absolute right-1.5 p-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-0 text-white rounded-full transition-all"
                >
                  <Send size={12} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Electron Settings Panel */}
        <ElectronSettings
          isOpen={isSettingsOpen}
          onClose={handleCloseSettings}
          settings={settings}
          onSave={handleSaveSettings}
        />

        {/* Radial Menu */}
        <RadialMenu
          avatarScale={avatarScale}
          isOpen={isRadialMenuOpen}
          onClose={() => setIsRadialMenuOpen(false)}
          gemini={gemini as any}
          apiKeyReady={apiKeyReady}
          isMicMuted={isMicMuted}
          isSpeakerMuted={isSpeakerMuted}
          isLiveMode={isLiveMode}
          isScreenVisionOn={isScreenVisionOn}
          onToggleMic={() => setIsMicMuted(!isMicMuted)}
          onToggleSpeaker={() => setIsSpeakerMuted(!isSpeakerMuted)}
          onToggleLive={handleToggleLive}
          onOpenSettings={handleOpenSettings}
          onConnect={handleMainAction}
          onToggleVision={() => {
            const next = !isScreenVisionOn;
            setIsScreenVisionOn(next);
            setToastMessage(next ? '👁️ Thị Giác: Aura đang quan sát màn hình...' : '🚫 Đã tắt Thị Giác màn hình.');
          }}
          isCameraVisionOn={isCameraVisionOn}
          isMeetingMode={isMeetingMode}
          onToggleMeetingMode={handleToggleMeetingMode}
          isPresentationMode={isPresentationMode}
          onTogglePresentationMode={() => handleTogglePresentationMode()}
          onToggleCameraVision={async () => {
            const next = !isCameraVisionOn;
            if (next) {
              if (!gemini.active) {
                setToastMessage('⚠️ Hãy bắt đầu trò chuyện trước khi bật Camera Vision.');
                return;
              }
              setIsCameraVisionOn(true);
              setToastMessage('📷 Camera Vision: Aura đang quan sát qua webcam...');
            } else {
              setIsCameraVisionOn(false);
              cameraVisionService.stop();
              setToastMessage('🚫 Đã tắt Camera Vision.');
            }
          }}
        />
      </div>

      {/* Meeting Notes Sidebar */}
      {isMeetingMode && (
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
      )}
    </div>
  );
};

export default AppDesktop;
