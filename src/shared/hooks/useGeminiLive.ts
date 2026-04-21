
import { useEffect, useRef, useState, useCallback } from 'react';
import { LiveService } from '../services/liveService';
import { EyeState, UserSettings, VideoState, UserLocation, ChatMessage, AppMode, GeneratedDocument, MeetingNoteEntry } from '../types';
import { extractAndSaveMemories } from '../services/memoryExtractor';
import { platform } from '../platformBridge';

export interface LiveCommandCallbacks {
  onToggleMute?: (mute: boolean) => void;
  onToggleScreenVision?: (enable: boolean) => void;
  onToggleCameraVision?: (enable: boolean) => void;
  onToggleMeetingMode?: (enable: boolean) => void;
  onClearChat?: () => void;
  onChangeBackground?: (bgName: string) => void;
  onCloseSettings?: () => void;
}

export const useGeminiLive = (settings: UserSettings, location: UserLocation | null, onOpenSettings?: () => void, commandCallbacks?: LiveCommandCallbacks) => {
  const [state, setState] = useState<EyeState>(EyeState.IDLE);
  const [isActive, setIsActive] = useState(false);
  const [volume, setVolume] = useState(0);
  const [videoState, setVideoState] = useState<VideoState>({ isOpen: false, type: null, url: '', title: '' });
  const [isDeepSleep, setIsDeepSleep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // App Mode (Assistant vs Translator)
  const [mode, setMode] = useState<AppMode>('assistant');
  const [notification, setNotification] = useState<string | null>(null);
  const [documentData, setDocumentData] = useState<GeneratedDocument | null>(null);
  const [meetingNotes, setMeetingNotes] = useState<MeetingNoteEntry[]>([]);

  // Chat History & Live Transcript
  const [history, setHistory] = useState<ChatMessage[]>([]);
  
  // BUG-H05 FIX: Sync history to ref so disconnect can read latest without closure dependency
  useEffect(() => { historyRef.current = history; }, [history]);
  // Sync mode to ref so disconnect can read without dependency
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Extended type for live transcript to include verification text
  const [liveTranscript, setLiveTranscript] = useState<{ text: string; role: 'user' | 'model'; originalText?: string } | null>(null);

  // Keep track of the last user text (accumulated) to pair with translation
  const lastUserTextRef = useRef<string>("");
  const lastFinalUserTextRef = useRef<string>("");

  const serviceRef = useRef<LiveService | null>(null);
  // BUG-H05 FIX: Track history via ref to avoid recreating disconnect on every message
  const historyRef = useRef<ChatMessage[]>([]);
  const modeRef = useRef<AppMode>('assistant');
  const speakerMutedRef = useRef(false);

  // FIX-06: Auto-reconnect state
  // userDisconnectedRef = true when user explicitly clicked disconnect — do NOT auto-reconnect.
  const userDisconnectedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 3;
  // Stable refs for settings/location/mode — no stale closure risk in auto-reconnect callback
  const settingsRef = useRef(settings);
  const locationRef = useRef(location);
  useEffect(() => {
    settingsRef.current = settings;
    // Đẩy settings mới vào service đang chạy để không cần reconnect
    if (serviceRef.current) serviceRef.current.updateSettings(settings);
  }, [settings]);
  useEffect(() => { locationRef.current = location; }, [location]);

  // ── Watchdog: phát hiện connection đơ im lặng ─────────────────
  // Nếu đang LISTENING > 90s mà không có transcript/state nào từ server
  // → connection chết âm thầm → tự động reconnect.
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(0);
  const WATCHDOG_TIMEOUT_MS = 90_000; // 90 giây không có tín hiệu = đơ

  const resetWatchdog = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    watchdogTimerRef.current = null;
  }, []);

  const startWatchdog = useCallback((triggerReconnect: () => void) => {
    resetWatchdog();
    watchdogTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= WATCHDOG_TIMEOUT_MS && !userDisconnectedRef.current) {
        console.warn('[Watchdog] Aura đơ im lặng! Đang tự kết nối lại...');
        triggerReconnect();
      }
    }, WATCHDOG_TIMEOUT_MS);
  }, [resetWatchdog]);

  // Ref to hold the latest callback to avoid unnecessary reconnections
  const onOpenSettingsRef = useRef(onOpenSettings);
  const commandCallbacksRef = useRef(commandCallbacks);
  useEffect(() => {
      onOpenSettingsRef.current = onOpenSettings;
  }, [onOpenSettings]);
  useEffect(() => {
      commandCallbacksRef.current = commandCallbacks;
  }, [commandCallbacks]);

  // FIX-06: Internal connect builder — used by both user connect() and auto-reconnect
  const _buildAndConnect = useCallback((resuming: boolean) => {
    const effectiveApiKey = settingsRef.current.apiKey || process.env.API_KEY;
    if (!effectiveApiKey) {
      setError('Vui lòng hoàn tất quá trình thiết lập API Key.');
      return;
    }

    if (serviceRef.current) serviceRef.current.disconnect();

    const service = new LiveService(effectiveApiKey);

    service.onStateChange = (s: EyeState) => {
      setState(s);
      resetWatchdog(); // bất kỳ state change nào = server vẫn sống
    };
    service.onVolumeChange = (v: number) => setVolume(v);
    service.onVideoCommand = (v: VideoState) => setVideoState(v);
    service.onDeepSleepCommand = () => setIsDeepSleep(true);
    service.onOpenSettingsCommand = () => {
      if (onOpenSettingsRef.current) onOpenSettingsRef.current();
    };
    service.onCloseSettingsCommand = () => {
      if (commandCallbacksRef.current?.onCloseSettings) commandCallbacksRef.current.onCloseSettings();
    };
    service.onError = (msg: string) => setError(msg);
    service.onNotification = (msg: string) => setNotification(msg);
    service.onOpenUrl = (url: string) => {
      console.log('[useGeminiLive] Auto-opening URL:', url);
      platform.openExternalUrl(url);
    };
    service.onToggleMute = (mute) => {
      if (commandCallbacksRef.current?.onToggleMute) commandCallbacksRef.current.onToggleMute(mute);
    };
    service.onToggleScreenVision = (enable) => {
      if (commandCallbacksRef.current?.onToggleScreenVision) commandCallbacksRef.current.onToggleScreenVision(enable);
    };
    service.onToggleCameraVision = (enable) => {
      if (commandCallbacksRef.current?.onToggleCameraVision) commandCallbacksRef.current.onToggleCameraVision(enable);
    };
    service.onToggleMeetingMode = (enable) => {
      if (commandCallbacksRef.current?.onToggleMeetingMode) commandCallbacksRef.current.onToggleMeetingMode(enable);
    };
    service.onClearChat = () => {
      if (commandCallbacksRef.current?.onClearChat) {
        commandCallbacksRef.current.onClearChat();
      } else {
        setHistory([]);
      }
    };
    service.onChangeBackground = (bgName) => {
      if (commandCallbacksRef.current?.onChangeBackground) commandCallbacksRef.current.onChangeBackground(bgName);
    };
    service.onDocumentGenerated = (doc: GeneratedDocument) => {
      setDocumentData(doc);
    };

    service.onMeetingNoteUpdate = (note: MeetingNoteEntry) => {
      setMeetingNotes(prev => [...prev, note]);
    };

    // Handle TEXT modality responses (muted / meeting mode)
    service.onTextResponse = (text: string) => {
      // Accumulate text parts into a transcript for display
      setLiveTranscript(prev => {
        const currentText = (prev?.role === 'model' ? prev.text : '') + text;
        return { text: currentText, role: 'model' };
      });
    };

    // FIX-02: Persist session handle across reconnects
    service.onSessionHandleUpdate = () => {
      // handle is stored internally in service, carried over on reconnect
    };

    // FIX-05: goAway — server signals 60s before forced close. Proactively reconnect.
    service.onGoAway = () => {
      console.log('[useGeminiLive] goAway: Initiating proactive reconnect in 5s...');
      setNotification('🔄 Aura đang làm mới kết nối...');
      // Give server 5s to finish current turn, then reconnect seamlessly
      reconnectTimerRef.current = setTimeout(() => {
        if (!userDisconnectedRef.current && serviceRef.current) {
          _buildAndConnect(true);
        }
      }, 5000);
    };

    // FIX-06: Auto-reconnect on unexpected disconnect
    service.onDisconnect = () => {
      serviceRef.current = null;
      setIsActive(false);
      setState(EyeState.IDLE);

      // If user explicitly disconnected, do NOT auto-reconnect
      if (userDisconnectedRef.current) return;

      const attempt = reconnectAttemptsRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('[useGeminiLive] Max reconnect attempts reached. Giving up.');
        setError('Kết nối bị ngắt. Nhấn nút để kết nối lại.');
        reconnectAttemptsRef.current = 0;
        return;
      }

      const delayMs = Math.min(1000 * 2 ** attempt, 8000); // 1s, 2s, 4s, 8s cap
      reconnectAttemptsRef.current = attempt + 1;
      console.log(`[useGeminiLive] Auto-reconnect attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delayMs}ms...`);
      setNotification(`🔄 Đang kết nối lại (${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`);

      reconnectTimerRef.current = setTimeout(() => {
        if (!userDisconnectedRef.current) {
          _buildAndConnect(true);
        }
      }, delayMs);
    };

    // Handle Transcription updates
    service.onTranscript = (text: string, isUser: boolean, isFinal: boolean) => {
        // Reset watchdog khi có transcript — server đang phản hồi
        resetWatchdog();

        const role = isUser ? 'user' : 'model';
        
        // Update user text buffer continuously (so it's ready when model replies in real-time)
        if (isUser) {
            lastUserTextRef.current = text;
            if (isFinal) lastFinalUserTextRef.current = text;
        }

        // Logic for Translator Mode: Attach original text to Model output
        let verificationText: string | undefined = undefined;
        if (!isUser && modeRef.current === 'translator') {
            verificationText = lastFinalUserTextRef.current || lastUserTextRef.current || undefined;
        }
        
        // Update live subtitles
        setLiveTranscript({ 
            text, 
            role, 
            originalText: verificationText 
        });

        // If finalized, push to history
        if (isFinal && text.trim().length > 0) {
            setHistory(prev => {
                // Avoid duplicates if rapid firing happens
                const lastMsg = prev[prev.length - 1];
                // Only suppress true duplicates if they fire within 1s (React double-render guard).
                // Legitimate repeated phrases (e.g., "Okay" said twice) must NOT be dropped.
                if (lastMsg && lastMsg.role === role && lastMsg.text === text) {
                    if (Date.now() - lastMsg.timestamp < 1000) return prev;
                }
                
                return [...prev, {
                    role,
                    text,
                    originalText: verificationText,
                    timestamp: Date.now()
                }];
            });
            // 🟢 FIX Stale Verification Text: clear user text buffer after AI uses it
            if (!isUser) {
                lastUserTextRef.current = "";
                lastFinalUserTextRef.current = "";
            }

            // Clear live transcript after a short delay
            setTimeout(() => {
                setLiveTranscript(current => current?.text === text ? null : current);
            }, 2000);
        }
    };
    
    // Pass location, current mode, and speaker mute state to connect
    service.connect(settingsRef.current, locationRef.current, modeRef.current, speakerMutedRef.current);
    serviceRef.current = service;
    if (!resuming) setIsActive(true);
    else setIsActive(true); // Re-activate on auto-reconnect

    // ── Khởi watchdog sau khi connect ─────────────────────────
    startWatchdog(() => {
      if (!userDisconnectedRef.current && serviceRef.current) {
        setNotification('⚡ Aura phát hiện kết nối bị treo — đang tự khôi phục...');
        _buildAndConnect(true);
      }
    });
  }, []); // Empty deps — uses refs only to stay stable

  const connect = useCallback(() => {
    userDisconnectedRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    _buildAndConnect(false);
  }, [_buildAndConnect]);

  // BUG-H05 FIX: No longer depends on [history] — uses historyRef instead.
  // BUG-H03 FIX: Only extract memories in assistant mode (not translator).
  const disconnect = useCallback(() => {
    // FIX-06: Mark as intentional disconnect to prevent auto-reconnect
    userDisconnectedRef.current = true;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // Dừng watchdog khi user tự disconnect
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }

    const currentHistory = historyRef.current;
    const currentMode = modeRef.current;
    if (currentHistory.length > 0 && currentMode === 'assistant') {
      try {
        extractAndSaveMemories(currentHistory);
      } catch (e) {
        console.warn('[useGeminiLive] Memory extraction failed:', e);
      }
    }

    if (serviceRef.current) {
      // FIX-02: Clear session handle on explicit disconnect so next session starts fresh
      serviceRef.current.clearSessionHandle();
      serviceRef.current.disconnect();
      serviceRef.current = null;
    }
    setState(EyeState.IDLE);
    setIsActive(false);
    setLiveTranscript(null);
    lastUserTextRef.current = '';
    lastFinalUserTextRef.current = '';
  }, []); // Empty deps: safe because we use refs

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    state,
    volume,
    videoState,
    setVideoState,
    isDeepSleep,
    setIsDeepSleep,
    connect,
    disconnect,
    active: isActive,
    error,
    clearError,
    history,
    liveTranscript,
    clearHistory,
    notification,
    clearNotification,
    mode,
    setMode,
    sendText: (text: string) => serviceRef.current?.sendText(text),
    toggleMic: (muted: boolean) => { if (serviceRef.current) serviceRef.current.isMicMuted = muted; },
    toggleSpeaker: (muted: boolean) => { if (serviceRef.current) serviceRef.current.isSpeakerMuted = muted; },
    toggleSpeakerAndReconnect: (muted: boolean) => {
      speakerMutedRef.current = muted;
      // Only toggle playback — do NOT reconnect (avoids 1007/1008 errors)
      if (serviceRef.current) {
        serviceRef.current.isSpeakerMuted = muted;
        console.log(`[useGeminiLive] Speaker ${muted ? 'MUTED (drop playback)' : 'UNMUTED (resume playback)'}. No reconnect.`);
      }
    },
    toggleLiveChat: (enable: boolean) => { if (serviceRef.current) serviceRef.current.toggleLiveChat(enable); },
    requestMicStartAfterReconnect: () => {
      // Set flag on current service if exists, or queue for next build
      if (serviceRef.current) {
        serviceRef.current.requestMicStartAfterReconnect();
      }
    },
    pausePlayback: () => serviceRef.current?.pausePlayback(),
    resumePlayback: () => serviceRef.current?.resumePlayback(),
    pauseListening: () => serviceRef.current?.pauseListening(),
    resumeListening: () => serviceRef.current?.resumeListening(),
    sendScreenFrame: (base64: string) => serviceRef.current?.sendScreenFrame(base64),
    documentData,
    clearDocument: () => setDocumentData(null),
    meetingNotes,
    clearMeetingNotes: () => setMeetingNotes([]),
    addMeetingNote: (note: MeetingNoteEntry) => setMeetingNotes(prev => [...prev, note]),
    removeMeetingNote: (id: string) => setMeetingNotes(prev => prev.filter(n => n.id !== id)),
    togglePinNote: (id: string) => setMeetingNotes(prev => prev.map(n =>
      n.id === id ? { ...n, isPinned: !n.isPinned } : n
    )),
  };
};
