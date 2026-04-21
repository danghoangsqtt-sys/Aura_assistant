import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { UserSettings, EyeState, VideoState, UserLocation, AppMode } from "../types";
import { getAudioContext, int16ToFloat32, base64ToArrayBuffer } from "../utils/audioUtils";
import { buildSystemInstruction } from "./promptBuilder";
import { handleToolCall } from "./toolHandler";
import { AudioCaptureService } from "./audioCapture";
import { platform } from "../platformBridge";
import { PresentationPhase } from "./presentationMode";

export class LiveService {
  private ai: GoogleGenAI;
  private session: any = null;
  private sessionPromise: Promise<any> | null = null;
  private resolvedSession: any = null; 

  private nextStartTime = 0;
  private audioSources = new Set<AudioBufferSourceNode>();
  private isInterrupted = false;
  private isSessionReady = false;
  private hasDisconnected = false;
  private isConnecting = false; 
  private isModelSpeaking = false;
  private playbackAnalyser: AnalyserNode | null = null;
  private playbackRafId: number | null = null;
  private micResumeAt = 0;
  private isAITurnActive = false; 

  public isMicMuted = false;
  public isSpeakerMuted = false;
  private useTextModality = false;
  private isMeetingMode = false;
  private pendingMicStart = false;  // Flag to auto-start mic after reconnect

  // ── Presentation Auto Mode State ──
  private presentationSlides: { slideNum: number; content: string }[] = [];
  private currentSlideIndex = 0;
  private scannedSlideCount = 0; // fallback total when no PPTX file is configured

  private currentInputTranscription = "";
  private currentOutputTranscription = "";
  private currentTextResponse = "";

  private currentSettings: UserSettings | null = null;
  private reminderTimers = new Map<string, ReturnType<typeof setTimeout>>();

  public onStateChange: (state: EyeState) => void = () => { };
  public onVolumeChange: (volume: number) => void = () => { };
  public onTranscript: (text: string, isUser: boolean, isFinal: boolean) => void = () => { };
  public onTextResponse: (text: string) => void = () => { };
  public onVideoCommand: (video: VideoState) => void = () => { };
  public onDeepSleepCommand: () => void = () => { };
  public onOpenSettingsCommand: () => void = () => { };
  public onCloseSettingsCommand: () => void = () => { };
  public onError: (message: string) => void = () => { };
  public onDisconnect: () => void = () => { };
  public onNotification: (message: string) => void = () => { };
  public onSessionHandleUpdate: (handle: string) => void = () => { };
  public onGoAway: () => void = () => { };
  public onOpenUrl: (url: string) => void = () => { }; 
  public onToggleMute: (mute: boolean) => void = () => { };
  public onToggleScreenVision: (enable: boolean) => void = () => { };
  public onToggleCameraVision: (enable: boolean) => void = () => { };
  public onToggleMeetingMode: (enable: boolean) => void = () => { };
  public onClearChat: () => void = () => { };
  public onChangeBackground: (bgName: string) => void = () => { };
  public onDocumentGenerated: (doc: any) => void = () => { };
  public onMeetingNoteUpdate: (note: any) => void = () => { };
  public clearSessionHandle() { }

  private audioCapture: AudioCaptureService;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.audioCapture = new AudioCaptureService({
      onAudioData: (base64) => {
        if (!this.isSessionReady) return;
        if (!this.shouldGateMicInput()) {
            this.safeSendRealtimeInput({ media: { mimeType: "audio/pcm;rate=16000", data: base64 } });
        }
      },
      onVolumeChange: (vol) => this.onVolumeChange(vol),
      onError: (msg) => {
        this.onStateChange(EyeState.IDLE);
        this.onError(msg);
      }
    });
  }

  private notifyDisconnectOnce() {
    if (this.hasDisconnected) return;
    this.hasDisconnected = true;
    this.onDisconnect();
  }

  private shouldGateMicInput() {
    return this.isMicMuted || this.isListeningPaused;
  }

  private markModelSpeakingStart() {
    this.isModelSpeaking = true;
    this.micResumeAt = Math.max(this.micResumeAt, performance.now() + 120);
    console.log('[LiveService] AI is speaking. Mic remains OPEN for interruptions.');
  }

  private scheduleMicResume(delayMs = 320) {
    this.micResumeAt = Math.max(this.micResumeAt, performance.now() + delayMs);
    if (this.audioSources.size === 0) {
      this.isModelSpeaking = false;
    }
  }

  private safeSendRealtimeInput(payload: any) {
    if (!this.isSessionReady || this.isListeningPaused) return;
    const session = this.resolvedSession;
    if (!session) return;
    try {
      if (typeof session.sendRealtimeInput === 'function') {
        session.sendRealtimeInput(payload);
      } else if (typeof session.send === 'function') {
        session.send({ realtimeInput: { mediaChunks: [payload.media] } });
      } else {
        console.error('[LiveService] No known send method on session object.');
      }
    } catch (e) { console.error('[LiveService] sendRealtimeInput THREW:', e); }
  }

  public sendWebcamFrame(base64: string) {
    if (this.isListeningPaused || !this.session) return;
    try {
      this.safeSendRealtimeInput({
        media: {
          mimeType: "image/jpeg",
          data: base64.replace(/^data:image\/jpeg;base64,/, "")
        }
      });
    } catch (e) { console.warn(e); }
  }

  public sendText(text: string) {
    const normalized = text.trim();
    if (!normalized) return;

    const dispatch = (session: any) => {
      // Clear voice transcript to prevent it from overwriting the typed text
      this.currentInputTranscription = "";
      this.onTranscript(normalized, true, true);
      console.log('[LiveService] sendText:', normalized);
      try {
        const validTurnsArray = [{ role: "user", parts: [{ text: normalized }] }];
        if (typeof session.sendClientContent === 'function') {
          session.sendClientContent({ turns: validTurnsArray, turnComplete: true });
        } else if (typeof session.send === 'function') {
          session.send(normalized);
        } else {
          console.error('[LiveService] sendText: No known send method on session object.');
        }
      } catch (e) {
        console.error('[LiveService] sendText THREW:', e);
      }
    };

    if (this.isSessionReady && this.resolvedSession) {
      dispatch(this.resolvedSession);
      return;
    }

    if (this.sessionPromise) {
      this.sessionPromise
        .then((session) => {
          this.resolvedSession = session;
          if (!this.isSessionReady) return;
          dispatch(session);
        })
        .catch((e) => console.error('[LiveService] sendText: sessionPromise rejected.', e));
      return;
    }

    console.warn('[LiveService] sendText: no active session.');
  }

  private lastScreenFrameTime = 0;

  public sendScreenFrame(base64Jpeg: string) {
    const now = Date.now();
    if (now - this.lastScreenFrameTime < 3000) return;
    this.lastScreenFrameTime = now;

    if (!this.isSessionReady || !this.resolvedSession) return;

    try {
      // CRITICAL: Do NOT use safeSendRealtimeInput here!
      // safeSendRealtimeInput has an isListeningPaused guard that silently drops
      // all input when Aura is speaking. During presentations, Aura is ALWAYS
      // speaking, so screen frames would NEVER reach the model.
      // Screen vision frames must ALWAYS be sent regardless of listening state.
      const session = this.resolvedSession;
      if (typeof session.sendRealtimeInput === 'function') {
        session.sendRealtimeInput({
          media: { mimeType: 'image/jpeg', data: base64Jpeg }
        });
      } else if (typeof session.send === 'function') {
        session.send({
          realtimeInput: {
            mediaChunks: [{ mimeType: 'image/jpeg', data: base64Jpeg }]
          }
        });
      }
      console.log('[LiveService] Screen frame sent to Gemini (bypass listening guard).');
    } catch (e) {
      console.warn('[LiveService] sendScreenFrame error:', e);
    }
  }

  async connect(settings: UserSettings, location: UserLocation | null, mode: AppMode, speakerMuted = false) {
    if (this.isConnecting || this.sessionPromise) {
        console.warn("LiveService: Connection already in progress or active.");
        return;
    }
    
    this.isConnecting = true;
    this.hasDisconnected = false;
    this.isSessionReady = false;
    this.currentSettings = settings;

    // Fix 1007/1008 on native-audio model: ALWAYS use AUDIO modality but just drop playback when muted
    this.useTextModality = false; 
    this.isSpeakerMuted = speakerMuted;
    this.isMeetingMode = mode === 'meeting';
    console.log(`[LiveService] Connecting with modality: AUDIO, mode: ${mode}, speakerMuted: ${speakerMuted}, meetingMode: ${this.isMeetingMode}`);

    const { systemInstruction, activeTools } = buildSystemInstruction(settings, location, mode);

    try {
      const audioCtx = getAudioContext();
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const toolsConfig: any[] = [
        { functionDeclarations: activeTools }
      ];

      if (mode !== 'translator') {
        toolsConfig.push({ googleSearch: {} });
      }

      const modelConfig: any = {
        responseModalities: this.useTextModality ? [Modality.TEXT] : [Modality.AUDIO], 
        ...(this.useTextModality ? {} : { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } } }),
        systemInstruction: { parts: [{ text: systemInstruction }] }, 
        tools: toolsConfig,
        inputAudioTranscription: {},
        ...(this.useTextModality ? {} : { outputAudioTranscription: {} }),
        thinkingConfig: { thinkingBudget: 0 },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            // Meeting mode: HIGH start sensitivity to detect even faint/distant speech
            // Normal mode: HIGH for responsive voice interaction
            startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
            // Meeting mode: LOW end sensitivity — don't cut off speakers mid-sentence
            endOfSpeechSensitivity: this.isMeetingMode ? 'END_SENSITIVITY_LOW' : 'END_SENSITIVITY_HIGH',
            // Meeting mode: longer prefix to capture start of soft-spoken words
            prefixPaddingMs: this.isMeetingMode ? 500 : 100,
            // Meeting mode: longer silence threshold — speakers may pause between points
            silenceDurationMs: this.isMeetingMode ? 1500 : 550,
          },
        },
      };

      const modelName = settings.liveModel || 'gemini-2.5-flash-preview-native-audio-dialog';

      const config: any = {
        model: modelName,
        config: modelConfig,
        callbacks: {
          onopen: this.handleOpen.bind(this),
          onmessage: this.handleMessage.bind(this),
          onclose: (e: any) => {
            console.log('[LiveService] WebSocket CLOSED. Code:', e?.code, 'Reason:', e?.reason);
            this.handleDisconnectCallback(e);
          },
          onerror: (e: any) => {
            this.handleErrorCallback(e);
          }
        }
      };

      this.sessionPromise = this.ai.live.connect(config);
      this.session = await this.sessionPromise;
      this.resolvedSession = this.session; 

    } catch (error: any) {
      console.error("Connect failed:", error);
      this.isConnecting = false;
      this.isSessionReady = false;
      this.audioCapture.cleanupAudioInput();
      this.session = null;
      this.sessionPromise = null;
      this.onStateChange(EyeState.IDLE);
      this.onError(error.message || "Không thể kết nối.");
      this.notifyDisconnectOnce();
    }
  }

  private handleDisconnectCallback(e: any) {
    this.isConnecting = false;
    this.isSessionReady = false;
    this.hasDisconnected = true;
    this.audioCapture.cleanupAudioInput();
    this.session = null;
    this.sessionPromise = null;
    const closeReason = typeof e?.reason === 'string' ? e.reason.toLowerCase() : '';
    const closeCode = e?.code || 0;
    if (closeReason.includes('quota') || closeReason.includes('exceeded') || closeCode === 1011) {
      this.onError('⚠️ Quá giới hạn API quota! Chuyển sang model khác trong Settings > System hoặc bật billing tại Google AI Studio.');
    } else if (closeReason.includes('api key') || closeReason.includes('not valid')) {
      this.onError('API Key không hợp lệ hoặc hết hạn.');
    } else if (closeReason.includes('model') || closeReason.includes('not found') || closeCode === 404) {
      this.onError('Model không tìm thấy. Kiểm tra tên model trong Settings > System.');
    } else if (closeCode === 1008 || closeReason.includes('permission') || closeReason.includes('403')) {
      this.onError('Không có quyền sử dụng Live API. Kiểm tra API Key.');
    } else if (closeCode >= 4000 || (closeCode !== 1000 && closeCode !== 0)) {
      this.onError(`Kết nối bị ngắt (code: ${closeCode}). Thử lại.`);
    }
    this.onStateChange(EyeState.IDLE);
    this.notifyDisconnectOnce();
  }

  private handleErrorCallback(e: any) {
    this.isConnecting = false;
    this.isSessionReady = false;
    this.audioCapture.cleanupAudioInput();
    this.session = null;
    this.sessionPromise = null;
    this.onStateChange(EyeState.IDLE);
    let msg = "Lỗi kết nối.";
    let rawMsg = typeof e === 'string' ? e : (e.message || JSON.stringify(e));

    if (rawMsg.includes("Network") || rawMsg.includes("fetch")) {
      msg = "Lỗi mạng: Kiểm tra kết nối Internet.";
    } else if (rawMsg.includes("404") || rawMsg.includes("not found")) {
      msg = "Lỗi API: Model không tìm thấy hoặc Project bị xóa.";
    } else if (rawMsg.includes("403") || rawMsg.includes("Permission")) {
      msg = "Lỗi API Key: Không có quyền truy cập.";
    }

    this.onError(msg);
    this.notifyDisconnectOnce();
  }

  private presentationPhase: PresentationPhase = 'idle';

  private handleOpen() {
    console.log('[LiveService] WebSocket OPEN. Session ready.');
    this.isConnecting = false;
    this.hasDisconnected = false;
    this.isSessionReady = true;
    
    this.onStateChange(EyeState.IDLE);

    if (this.currentSettings?.userVoiceSample && this.session) {
      try {
        const base64Data = this.currentSettings.userVoiceSample;
        this.safeSendRealtimeInput({ media: { mimeType: "audio/pcm;rate=16000", data: base64Data } });
      } catch (e) { console.error('[LiveService] Failed to send user voice sample', e); }

      setTimeout(() => {
        const session = this.resolvedSession;
        if (session && session.sendClientContent) {
            session.sendClientContent({
              turns: "SYSTEM NOTE: User Voice Signature provided.",
              turnComplete: true
            });
        }
      }, 500);
    }

    // Auto-start microphone if pending (e.g., after meeting mode reconnect)
    if (this.pendingMicStart) {
      this.pendingMicStart = false;
      console.log('[LiveService] 🎙️ Auto-starting mic (pendingMicStart was set)');
      // Small delay to let session stabilize
      setTimeout(() => this.toggleLiveChat(true), 300);
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.inputTranscription?.text) {
      this.currentInputTranscription += message.serverContent.inputTranscription.text;
      this.onTranscript(this.currentInputTranscription, true, false);
    }

    if (message.serverContent?.outputTranscription?.text) {
      this.currentOutputTranscription += message.serverContent.outputTranscription.text;
      this.onTranscript(this.currentOutputTranscription, false, false);
    }

    // Process Google Search Grounding metadata when the model uses built-in search
    const grounding = (message.serverContent as any)?.groundingMetadata;
    if (grounding) {
      if (grounding.webSearchQueries?.length) {
        console.log('[LiveService] 🔍 Grounding search queries:', grounding.webSearchQueries);
        this.onNotification(`🔍 Đang tra cứu: ${grounding.webSearchQueries[0]}`);
      }
      if (grounding.groundingChunks?.length) {
        console.log('[LiveService] 📑 Grounding sources:', grounding.groundingChunks.map((c: any) => c.web?.title || c.web?.uri).filter(Boolean));
      }
    }

    const isAiResponding =
        (message.serverContent?.modelTurn?.parts?.length || 0) > 0 ||
        !!message.serverContent?.outputTranscription?.text ||
        !!message.toolCall;

    if (isAiResponding && !this.isAITurnActive) {
        this.isAITurnActive = true;
        if (this.currentInputTranscription.trim()) {
            this.onTranscript(this.currentInputTranscription, true, true); 
            this.currentInputTranscription = "";
        }
    }

    const parts = message.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      // Handle TEXT parts (native-audio model may emit text alongside audio)
      if (part.text) {
        this.currentTextResponse += part.text;
        this.onTextResponse(part.text);
      }
      // Handle AUDIO parts — always AUDIO modality; STRICTLY drop playback if speaker muted
      if (part.inlineData?.data && !this.isInterrupted) {
        // When speaker is muted (e.g. meeting mode with mute on), silently consume audio
        if (this.isSpeakerMuted) {
          // Silently consume audio data — do NOT play, do NOT change state to SPEAKING
          this.isModelSpeaking = true;
        } else {
          this.markModelSpeakingStart();
          this.playAudioChunk(part.inlineData.data);
          this.onStateChange(EyeState.SPEAKING);
        }
      }
    }

    if (message.serverContent?.interrupted) {
      if (!this.isSpeakerMuted) {
        this.stopAudioPlayback();
      }
      this.isInterrupted = true;
      this.isAITurnActive = false;
      this.scheduleMicResume(160);
      if (this.currentOutputTranscription.trim()) {
        this.onTranscript(this.currentOutputTranscription.trim() + '…', false, true);
      }
      this.currentOutputTranscription = "";
    }

    if (message.serverContent?.turnComplete) {
      this.isInterrupted = false;
      this.isAITurnActive = false;
      if (this.currentOutputTranscription.trim()) {
        this.onTranscript(this.currentOutputTranscription, false, true);
        this.currentOutputTranscription = "";
      }
      // Finalize accumulated text response into chat history (always, for muted mode)
      if (this.currentTextResponse.trim()) {
        if (this.isSpeakerMuted) {
          // When muted, push text as final transcript (no audio played)
          this.onTranscript(this.currentTextResponse, false, true);
        }
        this.currentTextResponse = "";
      }
      setTimeout(() => {
        if (this.isSpeakerMuted || this.audioSources.size === 0) {
          this.scheduleMicResume(320);
          this.onStateChange(EyeState.LISTENING);
        }
        // Slide advancement is now driven by AI calling slide_done tool,
        // NOT by turnComplete. This prevents accidental double-advances
        // and eliminates the AI asking "shall I continue?" questions.
      }, 200);
    }

    if (message.toolCall) {
      handleToolCall(
        message.toolCall,
        {
          onOpenUrl: this.onOpenUrl.bind(this),
          onNotification: this.onNotification.bind(this),
          onDeepSleepCommand: this.onDeepSleepCommand.bind(this),
          onOpenSettingsCommand: this.onOpenSettingsCommand.bind(this),
          onCloseSettingsCommand: this.onCloseSettingsCommand.bind(this),
          onToggleMute: this.onToggleMute.bind(this),
          onToggleScreenVision: this.onToggleScreenVision.bind(this),
          onToggleCameraVision: this.onToggleCameraVision.bind(this),
          onSetAutoPresenting: (_enable: boolean) => {
            // No-op: auto-advance is now driven by AI calling slide_done, not by this flag
          },
          onGetPresentationFilePath: () => {
            return this.currentSettings?.presentationFilePath;
          },
          onSetPresentationPhase: (phase: string) => {
            this.presentationPhase = phase as PresentationPhase;
            console.log('[LiveService] Presentation phase:', phase);
          },
          onGetPresentationPhase: () => this.presentationPhase,
          onPresentationRead: (text: string, _pageCount: number) => {
            this.presentationSlides = [];
            this.currentSlideIndex = 0;
            const blocks = text.split(/\[SLIDE \d+\]/i).filter(b => b.trim());
            blocks.forEach((block, index) => {
              this.presentationSlides.push({ slideNum: index + 1, content: block.trim() });
            });
            console.log(`[LiveService] Parsed ${this.presentationSlides.length} slides`);
          },
          onSetCurrentSlideIndex: (idx: number) => {
            this.currentSlideIndex = idx;
            console.log('[LiveService] currentSlideIndex:', idx);
          },
          onGetCurrentSlideIndex: () => this.currentSlideIndex,
          onGetPresentationSlides: () => this.presentationSlides,
          onGetTotalSlides: () =>
            this.presentationSlides.length > 0
              ? this.presentationSlides.length
              : this.scannedSlideCount,
          onSetScannedSlideCount: (count: number) => {
            this.scannedSlideCount = count;
            // Trim PPTX slides nếu file báo nhiều hơn số slide thực tế scan
            // (VD: file báo 16 slide nhưng scan chỉ thấy 15 — slide 16 là trắng)
            if (count > 0 && this.presentationSlides.length > count) {
              console.log(`[LiveService] Trimming presentationSlides: ${this.presentationSlides.length} → ${count}`);
              this.presentationSlides = this.presentationSlides.slice(0, count);
            }
            console.log('[LiveService] scannedSlideCount set to:', count, `| presentationSlides: ${this.presentationSlides.length}`);
          },
          onForceScreenCapture: async () => {
             const base64 = await platform.captureScreen({ presentationMode: true });
             if (base64) {
               this.lastScreenFrameTime = 0; // bypass throttle
               this.sendScreenFrame(base64);
             }
          },
          onToggleMeetingMode: this.onToggleMeetingMode.bind(this),
          onClearChat: this.onClearChat.bind(this),
          onChangeBackground: this.onChangeBackground.bind(this),
          onDocumentGenerated: this.onDocumentGenerated.bind(this),
          onMeetingNoteUpdate: this.onMeetingNoteUpdate.bind(this),
          onCloseBrowserTabs: async (opts) => {
             const res = await platform.closeBrowserTabs(opts);
             return res;
          },
          onSearchFiles: async (opts) => {
             return await platform.searchFiles(opts);
          },
          onOpenPath: async (opts) => {
             return await platform.openPath(opts);
          },
          onCloseFolderWindow: async (opts) => {
             return await platform.closeFolderWindow(opts);
          },
        },
        this.currentSettings,
        this.reminderTimers,
        (fc, result) => {
          if (this.sessionPromise && this.isSessionReady) {
            this.sessionPromise.then(session => {
              if (!this.isSessionReady) return;
              try {
                if (typeof session.sendToolResponse === 'function') {
                  session.sendToolResponse({
                    functionResponses: [{ id: fc.id, name: fc.name, response: { result } }]
                  });
                } else if (typeof session.send === 'function') {
                  session.send({
                    toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result } }] }
                  });
                }
              } catch (e) { console.error('[LiveService] sendToolResponse THREW:', e); }
            }).catch(() => { });
          }
        }
      );
    }
  }

  private clearReminderTimers() {
    this.reminderTimers.forEach(timerId => clearTimeout(timerId));
    this.reminderTimers.clear();
  }

  private async playAudioChunk(base64: string) {
    // Guard: only block audio when speaker is explicitly muted
    if (this.isSpeakerMuted) return;
    const audioCtx = getAudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    if (!audioCtx || this.isInterrupted) return;
    try {
      this.markModelSpeakingStart();
      const arrayBuffer = base64ToArrayBuffer(base64);
      const float32Data = int16ToFloat32(arrayBuffer);
      const buffer = audioCtx.createBuffer(1, float32Data.length, 24000);
      buffer.copyToChannel(float32Data as any, 0);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;

      if (!this.playbackAnalyser) {
        this.playbackAnalyser = audioCtx.createAnalyser();
        this.playbackAnalyser.fftSize = 256;
        this.playbackAnalyser.connect(audioCtx.destination);
      }
      source.connect(this.playbackAnalyser);
      
      const currentTime = audioCtx.currentTime;
      if (this.nextStartTime < currentTime) this.nextStartTime = currentTime;
      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      this.audioSources.add(source);

      if (this.playbackRafId === null) {
        const updateLipSyncVolume = () => {
          if (!this.playbackAnalyser || this.audioSources.size === 0) {
            this.playbackRafId = null;
            this.onVolumeChange(0); 
            return;
          }
          const dataArray = new Uint8Array(this.playbackAnalyser.frequencyBinCount);
          this.playbackAnalyser.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          this.onVolumeChange(rms * 400); 
          
          this.playbackRafId = requestAnimationFrame(updateLipSyncVolume);
        };
        this.playbackRafId = requestAnimationFrame(updateLipSyncVolume);
      }

      source.onended = () => {
        this.audioSources.delete(source);
        if (this.audioSources.size === 0) setTimeout(() => {
          if (this.audioSources.size === 0) {
            this.scheduleMicResume(320);
            if (!this.isInterrupted) this.onStateChange(EyeState.LISTENING);
          }
        }, 100);
      };
    } catch (e) { console.error("Audio play error", e); }
  }

  private stopAudioPlayback() {
    const audioCtx = getAudioContext();
    this.audioSources.forEach(s => { try { s.stop(); } catch (e) { } });
    this.audioSources.clear();
    
    if (this.playbackRafId !== null) {
      cancelAnimationFrame(this.playbackRafId);
      this.playbackRafId = null;
    }
    this.onVolumeChange(0);

    this.scheduleMicResume(160);
    if (audioCtx) this.nextStartTime = audioCtx.currentTime;
    this.onStateChange(EyeState.LISTENING);
  }

  public disconnect() {
    this.isConnecting = false;
    this.isSessionReady = false;
    this.hasDisconnected = true;
    this.clearReminderTimers();
    this.stopAudioPlayback();

    this.audioCapture.cleanupAudioInput();
    this.audioCapture.suspendContext();

    this.resolvedSession = null; 
    if (this.session) {
      try { 
          this.session.close(); 
      } catch (e) {}
      this.session = null;
    } else if (this.sessionPromise) {
      this.sessionPromise.then(s => { try { s.close(); } catch (e) { } }).catch(() => { });
    }
    this.sessionPromise = null;
  }

  /**
   * Request mic to auto-start once the next WebSocket session opens.
   * Used during meeting mode toggle when we need to reconnect first.
   */
  public requestMicStartAfterReconnect() {
    this.pendingMicStart = true;
    console.log('[LiveService] 🔴 Mic auto-start QUEUED for next session open.');
  }

  /** Cập nhật settings mà không cần reconnect — dùng khi user thay đổi cài đặt trong lúc đang kết nối */
  public updateSettings(settings: UserSettings) {
    this.currentSettings = settings;
  }

  public toggleLiveChat(enable: boolean) {
    if (enable) {
        // In meeting mode, use MUCH higher gain for distant/indirect audio (e.g. conference rooms)
        // 4x boost minimum, with wider frequency range for capturing far-field voices
        const sensitivity = this.isMeetingMode 
          ? Math.max((this.currentSettings?.voiceSensitivity || 1.5) * 4, 6.0)  // 4x boost, min 6.0 for far-field
          : (this.currentSettings?.voiceSensitivity || 1.5);
        this.audioCapture.startAudioInput(sensitivity, this.isMeetingMode);
        this.onStateChange(EyeState.LISTENING);
    } else {
        this.audioCapture.cleanupAudioInput();
        this.onStateChange(EyeState.IDLE);
    }
  }

  public isPaused = false;

  public pausePlayback() {
    if (this.isPaused) return;
    this.isPaused = true;
    this.stopAudioPlayback();
    
    const target = this.currentSettings?.voiceSensitivity || 1.5;
    this.audioCapture.setGainTarget(target, 20);

    this.isModelSpeaking = false;
    this.micResumeAt = 0;

    this.onStateChange(EyeState.LISTENING);
    console.log('[LiveService] ⏸️ Playback PAUSED — mic restored for user input.');
  }

  public resumePlayback() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.onStateChange(EyeState.IDLE);
    console.log('[LiveService] ▶️ Playback RESUMED.');
  }

  public isListeningPaused = false;

  public pauseListening() {
    if (this.isListeningPaused) return;
    this.isListeningPaused = true;
    
    this.audioCapture.setGainTarget(0, 10);
    
    this.onStateChange(EyeState.IDLE);
    console.log('[LiveService] 🔇 Listening PAUSED — mic gated.');
  }

  public resumeListening() {
    if (!this.isListeningPaused) return;
    
    const target = this.currentSettings?.voiceSensitivity || 1.5;
    this.audioCapture.setGainTarget(target, 50);

    setTimeout(() => { this.isListeningPaused = false; }, 80);

    this.onStateChange(EyeState.LISTENING);
    console.log('[LiveService] 🎤 Listening RESUMED.');
  }
}
