
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UserSettings } from '../types';
import { UserProfile } from '../services/authService';
import { X, User, Cpu, Info, Upload, Languages, ArrowRightLeft, Key, ExternalLink, ShieldCheck, RefreshCcw, Facebook, Phone, Zap, Mic, Volume2, Trash2, Palette, Monitor, Download, Brain, AlertCircle, Clock } from 'lucide-react';
import { getAudioContext, float32ToInt16, arrayBufferToBase64 } from '../utils/audioUtils';
import { CHARACTER_MODELS } from '../constants/characters';
import { memoryService } from '../services/memoryService';


interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSave: (newSettings: UserSettings) => void;
  authUser?: UserProfile | null;
}

const SUPPORTED_LANGUAGES = [
    { code: 'vi', name: 'Tiếng Việt (Vietnamese)' },
    { code: 'en', name: 'English (Tiếng Anh)' },
    { code: 'zh', name: '中文 (Chinese - Mandarin)' },
    { code: 'hi', name: 'हिन्दी (Hindi - Indian)' },
    { code: 'ru', name: 'Русский (Russian)' },
    { code: 'ko', name: '한국어 (Korean)' },
    { code: 'ja', name: '日本語 (Japanese)' },
    { code: 'fr', name: 'Français (French)' },
    { code: 'de', name: 'Deutsch (German)' },
    { code: 'es', name: 'Español (Spanish)' },
    { code: 'it', name: 'Italiano (Italian)' },
    { code: 'pt', name: 'Português (Portuguese)' },
    { code: 'th', name: 'ไทย (Thai)' },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'ar', name: 'العربية (Arabic)' },
];

// ── Tab definitions ──────────────────────────────────────────
type TabId = 'key' | 'user' | 'voice' | 'appearance' | 'system' | 'translator' | 'presentation' | 'about';

const TABS: { id: TabId; icon: React.ReactNode; label: string }[] = [
  { id: 'key', icon: <Key size={15} />, label: 'API Key' },
  { id: 'user', icon: <User size={15} />, label: 'Người dùng' },
  { id: 'voice', icon: <Mic size={15} />, label: 'Giọng nói' },
  { id: 'appearance', icon: <Palette size={15} />, label: 'Giao diện' },
  { id: 'translator', icon: <Languages size={15} />, label: 'Phiên dịch' },
  { id: 'presentation', icon: <Monitor size={15} />, label: 'Thuyết trình' },
  { id: 'system', icon: <Cpu size={15} />, label: 'Hệ thống' },
  { id: 'about', icon: <Info size={15} />, label: 'Thông tin' },
];

// ── Reusable glass input style ───────────────────────────────
const glassInput = "w-full bg-white/[0.06] border border-white/[0.12] rounded-xl p-2.5 text-white/90 placeholder-white/30 focus:ring-2 focus:ring-white/20 focus:border-white/25 outline-none transition-all text-sm";
const glassSelect = `${glassInput} appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M7%2010L12%2015L17%2010%22%20stroke%3D%22%23ffffff%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[position:calc(100%-12px)_center] bg-[size:16px] pr-10 [&>option]:bg-neutral-800 [&>option]:text-white`;
const glassTextarea = `${glassInput} resize-none font-mono text-xs`;

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, authUser }) => {
  const [activeTab, setActiveTab] = useState<TabId>('key');
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pptxInputRef = useRef<HTMLInputElement>(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [micError, setMicError] = useState<string | null>(null); // BUG-M05 FIX: replace alert()
  const [memoryCount, setMemoryCount] = useState(0);

  // BUG-C02 FIX: Use ref instead of window global to store stopCapture
  const stopCaptureRef = useRef<(() => void) | null>(null);

  // Load memory count for display
  useEffect(() => {
    if (isOpen) {
      setMemoryCount(memoryService.getAllMemories().length);
    }
  }, [isOpen]);

  // BUG-C02 FIX: Cleanup via ref, not window global
  useEffect(() => {
    return () => {
      if (stopCaptureRef.current) {
        stopCaptureRef.current();
        stopCaptureRef.current = null;
      }
    };
  }, []);

  // BUG-M01 FIX: Compute hasSavedKey inside effect using settings reference
  const hasSavedKey = !!settings.apiKey && settings.apiKey.length > 5;
  const assistantName = localSettings.assistantName || 'Aura';

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
      setIsEditingKey(!hasSavedKey);
      setMicError(null);
    }
  }, [settings, hasSavedKey, isOpen]);

  // BUG-M01 FIX: Reset isEditingKey on close
  const handleClose = useCallback(() => {
    setIsEditingKey(!hasSavedKey);
    setMicError(null);
    onClose();
  }, [hasSavedKey, onClose]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setLocalSettings(prev => ({ ...prev, [name]: value }));
  };
  
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setLocalSettings(prev => ({ ...prev, [name]: checked }));
  };
  
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setLocalSettings(prev => ({ ...prev, [name]: parseFloat(value) }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setLocalSettings(prev => ({ ...prev, fileContext: text }));
      };
      reader.readAsText(file);
    }
  };

  // BUG-C01 FIX: Use AudioWorkletNode instead of deprecated ScriptProcessor.
  //   ScriptProcessor was connected to destination → causing ECHO (mic -> speaker).
  //   New approach: create isolated AudioContext at 16kHz, capture via worklet,
  //   disconnect from destination to prevent echo.
  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });

      // Use a SEPARATE AudioContext at 16kHz (matches Gemini input rate)
      const recordCtx = new AudioContext({ sampleRate: 16000 });
      const source = recordCtx.createMediaStreamSource(stream);
      const chunks: Float32Array[] = [];

      // Register inline AudioWorklet for PCM capture
      const workletCode = `
        class RecordProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (input && input[0]) this.port.postMessage(new Float32Array(input[0]));
            return true;
          }
        }
        registerProcessor('record-processor', RecordProcessor);
      `;
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await recordCtx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const workletNode = new AudioWorkletNode(recordCtx, 'record-processor');
      workletNode.port.onmessage = (e) => chunks.push(e.data);

      // BUG-C01 FIX: Connect source → worklet ONLY (no destination connection = no echo)
      source.connect(workletNode);
      // workletNode is NOT connected to recordCtx.destination → silent capture

      setIsRecording(true);
      setRecordProgress(0);

      let progress = 0;
      const timer = setInterval(() => {
        progress += 2;
        setRecordProgress(progress);
        if (progress >= 100) stopCapture();
      }, 80);

      const stopCapture = () => {
        clearInterval(timer);
        workletNode.port.onmessage = null;
        workletNode.disconnect();
        source.disconnect();
        stream.getTracks().forEach(t => t.stop());
        recordCtx.close().catch(() => {});
        setIsRecording(false);
        setRecordProgress(0);
        stopCaptureRef.current = null;

        if (chunks.length === 0) return;

        // Flatten all chunks
        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Float32Array(totalLen);
        let offset = 0;
        for (const c of chunks) { result.set(c, offset); offset += c.length; }

        const pcm16 = float32ToInt16(result);
        const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);
        setLocalSettings(prev => ({ ...prev, userVoiceSample: base64 }));
      };

      // BUG-C02 FIX: Store in ref, not window global
      stopCaptureRef.current = stopCapture;

    } catch (e: any) {
      console.error('Mic access failed', e);
      // BUG-M05 FIX: Inline error display instead of blocking alert()
      setMicError('Không thể truy cập Microphone: ' + (e?.message || 'Lỗi không xác định'));
    }
  };

  const stopRecordingManual = () => {
    stopCaptureRef.current?.();
  };

  const deleteVoiceSample = () => {
      setLocalSettings(prev => ({ ...prev, userVoiceSample: '' }));
  };

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  if (!isOpen) return null;

  // ================================================================
  // RENDER — macOS Frosted Glass Settings Panel
  // ================================================================
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 animate-overlay-in"
      style={{ background: 'rgba(0, 0, 0, 0.45)' }}
      onClick={handleClose}
    >
      <div
        className="glass-panel rounded-2xl w-full max-w-[520px] flex flex-col overflow-hidden animate-settings-in select-none"
        style={{
          maxHeight: 'min(580px, 92dvh)',
          WebkitAppRegion: 'no-drag',
        } as any}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header — macOS style ──────────────────────────── */}
        <div
          className="relative flex items-center justify-center px-4 py-3 border-b border-white/[0.08]"
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          {/* macOS traffic light close button */}
          <button
            onClick={handleClose}
            className="absolute left-3.5 w-[13px] h-[13px] rounded-full bg-[#ff5f57] hover:bg-[#ff3b30] transition-colors group"
            style={{ WebkitAppRegion: 'no-drag' } as any}
            title="Đóng"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[8px] font-bold text-black/60 flex items-center justify-center leading-none">✕</span>
          </button>
          <h2 className="text-[13px] font-semibold text-white/80 tracking-wide">{assistantName} Settings</h2>
        </div>

        {/* ── Main Body (Sidebar + Content) ─────────────────── */}
        <div className="flex flex-1 min-h-0">
          
          {/* ── Sidebar (Tabs) ──────────────────────────────── */}
          <div className="w-[140px] min-w-[140px] flex flex-col gap-1 p-2.5 border-r border-white/[0.06] bg-black/10 overflow-y-auto custom-scrollbar">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium transition-all text-left ${
                  activeTab === tab.id
                    ? 'bg-white/[0.12] text-white shadow-sm shadow-black/20'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
                }`}
              >
                {tab.icon}
                <span className="flex-1 whitespace-nowrap">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── Content Area ───────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" style={{ minHeight: 0 }}>

          {/* ═══════════════ API KEY TAB ═══════════════ */}
          {activeTab === 'key' && (
            <div className="space-y-4">
              {/* Security notice */}
              <div className="bg-amber-500/[0.08] border border-amber-500/20 rounded-xl p-3">
                <h3 className="text-amber-400/90 font-semibold text-xs mb-1 flex items-center gap-1.5">
                  <ShieldCheck size={14} />
                  Bảo mật API Key
                </h3>
                <p className="text-[11px] text-amber-200/60 leading-relaxed">
                  API Key sẽ được mã hóa trước khi lưu vào LocalStorage.
                  Sau khi lưu, bạn không thể xem lại toàn bộ ký tự.
                </p>
              </div>

              {/* Key input */}
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1.5">Gemini API Key</label>
                {!isEditingKey ? (
                  <div className="flex items-center gap-2 bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl p-3">
                    <div className="flex-1 font-mono text-emerald-400/80 tracking-widest text-xs">
                      ••••••••••••••••••• (Đã lưu)
                    </div>
                    <button
                      onClick={() => { setLocalSettings(prev => ({ ...prev, apiKey: '' })); setIsEditingKey(true); }}
                      className="px-2.5 py-1 bg-white/[0.08] hover:bg-white/[0.14] text-[10px] text-white/70 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCcw size={10} /> Đổi
                    </button>
                  </div>
                ) : (
                  <input
                    type="password"
                    name="apiKey"
                    value={localSettings.apiKey || ''}
                    onChange={handleInputChange}
                    placeholder="Dán API Key (AIzaSy...)"
                    className={`${glassInput} font-mono`}
                    autoComplete="off"
                  />
                )}

                {(!localSettings.apiKey && isEditingKey) && (
                  <p className="text-[10px] text-red-400/80 mt-1.5">* Bắt buộc để sử dụng.</p>
                )}
              </div>

              {/* Guide */}
              <div className="border-t border-white/[0.06] pt-3">
                <h4 className="text-[11px] font-medium text-white/60 mb-2">Hướng dẫn lấy Key:</h4>
                <ol className="space-y-1.5 text-[10px] text-white/40 list-decimal pl-3.5">
                  <li>Truy cập <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-400/80 hover:underline inline-flex items-center gap-0.5">Google AI Studio <ExternalLink size={8} /></a></li>
                  <li>Đăng nhập bằng Google Account.</li>
                  <li>Nhấn <strong className="text-white/60">Create API Key</strong>.</li>
                  <li>Sao chép chuỗi <code className="text-white/50 bg-white/[0.06] px-1 rounded">AIza...</code> và dán vào ô trên.</li>
                  <li>Nhấn <strong className="text-white/60">Save</strong>.</li>
                </ol>
              </div>
            </div>
          )}

          {/* ═══════════════ USER TAB ═══════════════ */}
          {activeTab === 'user' && (
            <div className="space-y-4">
              {/* User Profile Card */}
              {authUser && (
                <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                  <div className="flex items-start gap-4 relative z-10">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-xl font-bold text-white shadow-lg border-2 border-white/10 flex-shrink-0">
                      {authUser.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-white truncate pr-4">{authUser.displayName}</h3>
                      <p className="text-sm text-white/50 truncate mb-2">{authUser.email}</p>
                      
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider ${
                          authUser.role === 'admin' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {authUser.role === 'admin' ? 'Quyền Quản Trị' : 'Thành Viên'}
                        </span>
                        <span className="px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider bg-green-500/20 text-green-400 border border-green-500/30">
                          Đã Kích Hoạt
                        </span>
                        <span className="px-2 py-1 rounded-md text-[10px] text-white/40 flex items-center gap-1 border border-white/5 bg-white/5">
                          <Clock size={10} />
                          Tham gia: {new Date(authUser.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-2"></div>

              <div className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1.5 flex items-center gap-1.5">
                  <Languages size={12} /> Ngôn ngữ
                </label>
                <select name="language" value={localSettings.language || 'vi'} onChange={handleInputChange} className={glassSelect}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1.5">Tên trợ lý</label>
                <input type="text" name="assistantName" value={localSettings.assistantName || 'Aura'} onChange={handleInputChange} className={glassInput} placeholder="Aura" />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1.5">Biệt danh của bạn</label>
                <input type="text" name="userName" value={localSettings.userName} onChange={handleInputChange} className={glassInput} placeholder="Ông chủ" />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-2">Knowledge Base (.txt)</label>
                <div
                  className="border border-dashed border-white/[0.15] rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.04] transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={20} className="text-white/30 mb-1.5" />
                  <span className="text-[10px] text-white/35">
                    {localSettings.fileContext ? "✓ File đã tải" : "Upload .txt"}
                  </span>
                  <input type="file" accept=".txt" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                </div>
              </div>
            </div>
            </div>
          )}

          {/* ═══════════════ PRESENTATION TAB ═══════════════ */}
          {activeTab === 'presentation' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-500/[0.08] border border-blue-500/15 rounded-xl">
                <h3 className="text-blue-300/90 font-medium text-xs mb-0.5 flex items-center gap-1.5">
                  <Monitor size={13} /> Thuyết trình tự động
                </h3>
                <p className="text-[10px] text-blue-200/50 leading-relaxed">
                  Cung cấp đường dẫn tới file tài liệu (chỉ hỗ trợ .pptx hiện tại).
                  Aura sẽ tự động đọc nội dung text bên trong và hiểu cấu trúc slide trước khi bắt đầu bài nói của bạn.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-2">Đường dẫn File PPTX</label>
                <div 
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    name="presentationFilePath"
                    value={localSettings.presentationFilePath || ''}
                    onChange={handleInputChange}
                    className={glassInput}
                    placeholder="C:\Users\...\bai_thuyet_trinh.pptx"
                  />
                  <button 
                    type="button"
                    onClick={() => pptxInputRef.current?.click()}
                    className="shrink-0 px-3 py-2.5 bg-white/10 hover:bg-white/20 transition-colors border border-white/10 rounded-xl text-xs text-white"
                  >
                    Mở tệp
                  </button>
                  <input 
                    type="file" 
                    accept=".pptx" 
                    ref={pptxInputRef} 
                    className="hidden" 
                    onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file && (file as any).path) {
                         handleInputChange({
                            target: { name: 'presentationFilePath', value: (file as any).path }
                         } as any);
                       }
                    }} 
                  />
                </div>
                {localSettings.presentationFilePath && (
                  <p className="text-[10px] text-emerald-400/80 mt-2 flex items-center gap-1.5">
                    <ShieldCheck size={12} /> Đã cập nhật đường dẫn tài liệu. Aura đã sẵn sàng.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════ VOICE TAB ═══════════════ */}
          {activeTab === 'voice' && (
            <div className="space-y-4">
              <div className="p-3 bg-purple-500/[0.08] border border-purple-500/15 rounded-xl">
                <h3 className="text-purple-300/90 font-medium text-xs mb-0.5 flex items-center gap-1.5">
                  <User size={13} /> Định danh người dùng
                </h3>
                <p className="text-[10px] text-purple-200/50 leading-relaxed">
                  {assistantName} sẽ ưu tiên giọng nói của bạn. Phát hiện giọng lạ sẽ xác nhận danh tính.
                </p>
              </div>

              {/* Voice Sample Recorder */}
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-2">Mẫu giọng nói</label>
                <div className="bg-white/[0.04] rounded-xl p-4 flex flex-col items-center gap-3 border border-white/[0.08]">
                  {localSettings.userVoiceSample ? (
                    <div className="flex flex-col items-center gap-2.5 w-full">
                      <div className="flex items-center gap-1.5 text-emerald-400/80 bg-emerald-500/[0.08] px-3 py-1.5 rounded-full border border-emerald-500/15 text-xs">
                        <ShieldCheck size={13} />
                        <span className="font-medium">Đã có mẫu</span>
                      </div>
                      <button
                        onClick={deleteVoiceSample}
                        className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-red-500/10 text-white/40 hover:text-red-400/80 transition-colors text-[11px]"
                      >
                        <Trash2 size={13} /> Xóa mẫu
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 w-full">
                      <div className="w-14 h-14 rounded-full bg-white/[0.06] flex items-center justify-center relative">
                        {isRecording ? (
                          <div className="absolute inset-0 border-[3px] border-red-400/70 rounded-full border-t-transparent animate-spin" />
                        ) : (
                          <Mic size={20} className="text-white/30" />
                        )}
                      </div>

                      {isRecording ? (
                        <div className="w-full space-y-2">
                          <p className="text-[10px] text-center text-red-400/80 animate-pulse">Đang ghi âm...</p>
                          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                            <div className="h-full bg-red-400/60 transition-all duration-75" style={{ width: `${recordProgress}%` }} />
                          </div>
                          <button onClick={stopRecordingManual} className="w-full py-1.5 bg-white/[0.06] rounded-lg text-[10px] text-white/50 hover:bg-white/[0.1] transition-colors">Dừng sớm</button>
                        </div>
                      ) : (
                        <button
                          onClick={startRecording}
                          className="px-5 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300/90 rounded-full text-xs font-medium transition-colors border border-purple-500/20"
                        >
                          Bắt đầu ghi (4s)
                        </button>
                      )}
                      <p className="text-[9px] text-white/25 text-center px-2">
                        Hãy nói: "Chào {assistantName}, tôi là {localSettings.userName || 'chủ nhân'}, hãy nhớ giọng nói của tôi."
                      </p>
                      {/* BUG-M05 FIX: Show micError inline instead of alert() */}
                      {micError && (
                        <div className="flex items-center gap-1.5 text-red-400/80 bg-red-500/[0.08] border border-red-500/15 rounded-lg px-2.5 py-1.5 text-[10px] w-full">
                          <AlertCircle size={12} className="shrink-0" />
                          <span>{micError}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Sensitivity Slider */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[11px] font-medium text-white/50 flex items-center gap-1.5">
                    <Volume2 size={13} /> Độ nhạy Micro
                  </label>
                  <span className="text-[10px] font-mono bg-white/[0.06] px-1.5 py-0.5 rounded text-purple-300/70">
                    {localSettings.voiceSensitivity?.toFixed(1) || 1.5}x
                  </span>
                </div>
                <input
                  type="range" name="voiceSensitivity" min="0.5" max="5.0" step="0.1"
                  value={localSettings.voiceSensitivity || 1.5} onChange={handleSliderChange}
                  className="w-full h-1.5 bg-white/[0.08] rounded-lg appearance-none cursor-pointer accent-purple-400"
                />
                <div className="flex justify-between text-[9px] text-white/20 mt-1">
                  <span>Thấp</span><span>Mặc định</span><span>Cao</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════ TRANSLATOR TAB ═══════════════ */}
          {activeTab === 'translator' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-500/[0.08] border border-blue-500/15 rounded-xl">
                <p className="text-[11px] text-blue-200/60 leading-relaxed">
                  Phiên dịch trực tiếp giữa hai người nói hai ngôn ngữ khác nhau.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-medium text-white/40 mb-1">Language A</label>
                  <select name="translationLangA" value={localSettings.translationLangA || 'vi'} onChange={handleInputChange} className={glassSelect}>
                    {SUPPORTED_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                  </select>
                </div>
                <div className="pt-4"><ArrowRightLeft className="text-white/20" size={16} /></div>
                <div className="flex-1">
                  <label className="block text-[10px] font-medium text-white/40 mb-1">Language B</label>
                  <select name="translationLangB" value={localSettings.translationLangB || 'en'} onChange={handleInputChange} className={glassSelect}>
                    {SUPPORTED_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[9px] text-white/25 italic">AI sẽ tự phát hiện ngôn ngữ và dịch sang ngôn ngữ còn lại.</p>
            </div>
          )}

          {/* ═══════════════ APPEARANCE TAB ═══════════════ */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              {/* Character Selector */}
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-2.5">Nhân vật Avatar</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {Object.entries(CHARACTER_MODELS).map(([id, char]) => {
                    const isSelected = (localSettings.avatarCharacter || 'haru') === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setLocalSettings(prev => ({ ...prev, avatarCharacter: id as any }))}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-white/25 bg-white/[0.12] shadow-lg shadow-white/5'
                            : 'border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12] hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="text-lg">{char.emoji}</span>
                        <span className={`text-[9px] font-medium truncate w-full text-center ${isSelected ? 'text-white/80' : 'text-white/35'}`}>{char.name}</span>
                        {isSelected && <span className="w-1 h-1 rounded-full bg-white/60" />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-white/25 mt-1.5">
                  {CHARACTER_MODELS[localSettings.avatarCharacter || 'haru']?.desc}
                </p>
                {localSettings.avatarCharacter === 'custom' && (
                  <div className="mt-2.5">
                    <label className="block text-[10px] text-white/35 mb-1">URL Model (.model3.json)</label>
                    <input
                      type="url" name="live2dModelUrl" value={localSettings.live2dModelUrl || ''} onChange={handleInputChange}
                      placeholder="https://example.com/model.model3.json"
                      className={`${glassInput} font-mono text-[10px]`}
                    />
                  </div>
                )}
              </div>

              <div className="h-px bg-white/[0.06]" />

              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1.5">Theme</label>
                <select name="appTheme" value={localSettings.appTheme || 'dark'} onChange={handleInputChange} className={glassSelect}>
                  <option value="dark">Dark Mode</option>
                  <option value="light">Light Mode</option>
                  <option value="midnight">Midnight Blue</option>
                  <option value="cyberpunk">Cyberpunk</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1.5">Background</label>
                <select name="auraBackground" value={localSettings.auraBackground || 'default'} onChange={handleInputChange} className={glassSelect}>
                  <option value="default">Mặc định (Blobs)</option>
                  <option value="office">Văn phòng</option>
                  <option value="anime_room">Phòng Anime</option>
                  <option value="scifi">Sci-fi Scene</option>
                </select>
              </div>
            </div>
          )}

          {/* ═══════════════ SYSTEM TAB ═══════════════ */}
          {activeTab === 'system' && (
            <div className="space-y-3.5">
              {/* Live Model */}
              <div className="bg-indigo-500/[0.07] border border-indigo-500/15 rounded-xl p-3">
                <label className="block text-[11px] font-semibold text-indigo-300/80 mb-0.5 flex items-center gap-1.5">
                  <Cpu size={13} /> Gemini Live Model
                </label>
                <p className="text-[9px] text-indigo-200/40 mb-2">Native Audio — streaming thời gian thực.</p>
                <select name="liveModel" disabled className={`${glassSelect} opacity-60 cursor-not-allowed`}
                  value={localSettings.liveModel || 'gemini-2.5-flash-native-audio-preview-09-2025'} onChange={handleInputChange}
                >
                  <option value="gemini-2.5-flash-native-audio-preview-09-2025">🚀 Aura Native Engine v2.0</option>
                </select>
                <div className="mt-1.5 p-2 bg-indigo-500/[0.06] border border-indigo-500/10 rounded-lg">
                  <p className="text-[9px] text-indigo-300/50">
                    💡 Model đã khóa cứng vào phiên bản ổn định nhất.
                  </p>
                </div>
              </div>

              {/* System Instructions */}
              <div>
                <label className="block text-[11px] font-medium text-white/50 mb-1.5">System Instructions</label>
                <textarea
                  name="systemInstruction" value={localSettings.systemInstruction} onChange={handleInputChange}
                  rows={4} className={glassTextarea}
                />
              </div>

              {/* Toggle: Fast Response */}
              <div className="flex items-center justify-between bg-white/[0.04] p-3 rounded-xl border border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg text-purple-400/70"><Zap size={14} /></div>
                  <div>
                    <p className="text-[11px] font-medium text-white/70">Phản hồi nhanh</p>
                    <p className="text-[9px] text-white/30">Giảm suy nghĩ, trả lời tức thì</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="optimizeLatency" checked={localSettings.optimizeLatency || false} onChange={handleCheckboxChange} className="sr-only peer" />
                  <div className="w-9 h-5 bg-white/[0.1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/80 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500/60" />
                </label>
              </div>

              {/* Toggle: Device Coverage */}
              <div className="flex items-center justify-between bg-white/[0.04] p-3 rounded-xl border border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400/70"><Cpu size={14} /></div>
                  <div>
                    <p className="text-[11px] font-medium text-white/70">Ưu tiên độ phủ</p>
                    <p className="text-[9px] text-white/30">Giảm hiệu ứng, ổn định hơn</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="optimizeForCoverage" checked={localSettings.optimizeForCoverage !== false} onChange={handleCheckboxChange} className="sr-only peer" />
                  <div className="w-9 h-5 bg-white/[0.1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/80 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500/60" />
                </label>
              </div>

              {/* BUG-M02 FIX: Memory Management UI */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400/70"><Brain size={13} /></div>
                    <div>
                      <p className="text-[11px] font-medium text-white/70">Trí nhớ dài hạn</p>
                      <p className="text-[9px] text-white/30">{memoryCount} sự kiện đã ghi nhớ</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm('Xóa toàn bộ ký ức? Không thể hoàn tác.')) {
                        memoryService.clearAll();
                        setMemoryCount(0);
                      }
                    }}
                    className="px-2.5 py-1 bg-red-500/[0.08] hover:bg-red-500/15 border border-red-500/15 text-red-400/70 hover:text-red-400 rounded-lg text-[10px] transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={10} /> Xóa
                  </button>
                </div>
                {memoryCount === 0 && (
                  <p className="text-[9px] text-white/20 italic">Chưa có ký ức. Bắt đầu trò chuyện để Aura học hỏi!</p>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════ ABOUT TAB ═══════════════ */}
          {activeTab === 'about' && (
            <div className="text-center space-y-4 py-2">
              <div>
                <div className="w-16 h-16 bg-gradient-to-tr from-purple-500/80 to-pink-500/80 rounded-2xl mx-auto flex items-center justify-center mb-3 text-2xl font-bold text-white shadow-lg shadow-purple-500/20">
                  {assistantName.charAt(0).toUpperCase()}
                </div>
                <h3 className="text-base font-bold text-white/90">{assistantName} Live</h3>
                <p className="text-white/35 text-[11px]">Được phát triển bởi DHsystem_LÊ BÁ ĐĂNG HOÀNG</p>
                <div className="mt-2 flex items-center justify-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-purple-500/10 border border-purple-500/15 text-purple-300/70">v2.0</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-500/10 border border-emerald-500/15 text-emerald-300/70">PIP Overlay</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-blue-500/10 border border-blue-500/15 text-blue-300/70">Multi-Character</span>
                </div>
              </div>

              {/* Desktop Download */}
              <div className="border border-white/[0.08] rounded-xl p-3 bg-white/[0.03] text-left">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400/70"><Monitor size={14} /></div>
                  <div>
                    <h4 className="text-[11px] font-semibold text-white/75">Desktop App</h4>
                    <p className="text-[8px] text-white/30">Always-on-top overlay</p>
                  </div>
                </div>
              </div>

              {/* Credits */}
              <div className="pt-2 border-t border-white/[0.06]">
                <p className="text-[11px] text-white/35 mb-3">
                  Bản quyền <span className="font-semibold text-white/60">DHsystem</span>
                </p>
                <div className="flex flex-col items-center gap-2">
                  <a href="https://www.facebook.com/profile.php?id=100009399084422" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/[0.08] hover:bg-blue-500/15 border border-blue-500/15 rounded-lg text-blue-300/70 text-[11px] transition-all w-fit"
                  >
                    <Facebook size={13} /> Facebook
                  </a>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-white/40 text-[11px] w-fit">
                    <Phone size={13} className="text-emerald-400/60" />
                    Zalo: 0343019101
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* ── Footer — macOS style buttons ──────────────────── */}
        <div className="px-4 py-3 border-t border-white/[0.06] flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-1.5 text-[11px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-1.5 bg-white/[0.12] hover:bg-white/[0.18] text-white/90 rounded-lg text-[11px] font-semibold transition-all border border-white/[0.1] shadow-lg shadow-black/20"
          >
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
