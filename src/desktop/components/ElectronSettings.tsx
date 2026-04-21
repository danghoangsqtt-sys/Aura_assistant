/**
 * ElectronSettings.tsx — Settings Panel for Electron Transparent Window
 *
 * Đây là settings panel riêng cho Electron App:
 * - KHÔNG dùng `fixed inset-0` overlay (sẽ phá transparent window)
 * - KHÔNG dùng `backdrop-filter: blur()` (gây crash/blank trên transparent window)
 * - Render dạng absolute panel bên trong container, thay thế avatar khi mở
 * - Dùng solid semi-transparent backgrounds thay vì blur
 * - Tự chứa toàn bộ logic, không phụ thuộc SettingsModal shared
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UserSettings } from '../../shared/types';
import {
  X, User, Cpu, Info, Upload, Languages, ArrowRightLeft,
  Key, ExternalLink, ShieldCheck, RefreshCcw, Zap, Mic,
  Volume2, Trash2, Palette, Brain, AlertCircle, ChevronLeft, Monitor
} from 'lucide-react';
import { float32ToInt16, arrayBufferToBase64 } from '../../shared/utils/audioUtils';
import { CHARACTER_MODELS } from '../../shared/constants/characters';
import { memoryService } from '../../shared/services/memoryService';

interface ElectronSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSave: (newSettings: UserSettings) => void;
}

// ── Tab config ───────────────────────────────────────────────
type TabId = 'user' | 'key' | 'voice' | 'appearance' | 'presentation' | 'system' | 'about';

const TABS: { id: TabId; icon: React.ReactNode; label: string }[] = [
  { id: 'user', icon: <User size={14} />, label: 'Người dùng' },
  { id: 'key', icon: <Key size={14} />, label: 'API Key' },
  { id: 'voice', icon: <Mic size={14} />, label: 'Giọng nói' },
  { id: 'appearance', icon: <Palette size={14} />, label: 'Giao diện' },
  { id: 'presentation', icon: <Monitor size={14} />, label: 'Thuyết trình' },
  { id: 'system', icon: <Cpu size={14} />, label: 'Hệ thống' },
  { id: 'about', icon: <Info size={14} />, label: 'Thông tin' },
];

// ── Inline styles (no Tailwind backdrop-blur) ────────────────
const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgba(30,30,35,0.97) 0%, rgba(22,22,28,0.98) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 25px 80px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.1) inset, 0 1px 0 rgba(255,255,255,0.05) inset',
  borderRadius: '20px',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px',
  padding: '8px 12px',
  color: 'rgba(255,255,255,0.85)',
  fontSize: '12px',
  outline: 'none',
  width: '100%',
  transition: 'border-color 0.2s',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as any,
  cursor: 'pointer',
};

const ElectronSettings: React.FC<ElectronSettingsProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [activeTab, setActiveTab] = useState<TabId>('user');
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pptxInputRef = useRef<HTMLInputElement>(null);
  
  // Proxy was removed.

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [memoryCount, setMemoryCount] = useState(0);
  const stopCaptureRef = useRef<(() => void) | null>(null);

  // Animation state
  const [isVisible, setIsVisible] = useState(false);

  const hasSavedKey = !!settings.apiKey && settings.apiKey.length > 5;
  const assistantName = localSettings.assistantName || 'Aura';

  // Sync settings when opened
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
      setIsEditingKey(!hasSavedKey);
      setMicError(null);
      setMemoryCount(memoryService.getAllMemories().length);
      // Trigger entrance animation
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen, settings, hasSavedKey]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (stopCaptureRef.current) {
        stopCaptureRef.current();
        stopCaptureRef.current = null;
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // ── Handlers ───────────────────────────────────────────────
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

  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      const recordCtx = new AudioContext({ sampleRate: 16000 });
      const source = recordCtx.createMediaStreamSource(stream);
      const chunks: Float32Array[] = [];

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
      source.connect(workletNode);

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
        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Float32Array(totalLen);
        let offset = 0;
        for (const c of chunks) { result.set(c, offset); offset += c.length; }
        const pcm16 = float32ToInt16(result);
        const base64 = arrayBufferToBase64(pcm16.buffer as ArrayBuffer);
        setLocalSettings(prev => ({ ...prev, userVoiceSample: base64 }));
      };
      stopCaptureRef.current = stopCapture;
    } catch (e: any) {
      console.error('Mic access failed', e);
      setMicError('Không thể truy cập Microphone: ' + (e?.message || 'Lỗi không xác định'));
    }
  };

  const handleSave = () => {
    onSave(localSettings);
    handleClose();
  };

  if (!isOpen) return null;

  // ── Render helpers ─────────────────────────────────────────
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
      {children}
    </div>
  );

  const ToggleRow = ({ icon, iconColor, label, desc, name, checked }: {
    icon: React.ReactNode; iconColor: string; label: string; desc: string; name: string; checked: boolean;
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ padding: '5px', background: iconColor, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>{label}</div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{desc}</div>
        </div>
      </div>
      <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" name={name} checked={checked} onChange={handleCheckboxChange} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <div style={{
          width: '36px', height: '20px', borderRadius: '10px',
          background: checked ? 'rgba(147, 51, 234, 0.6)' : 'rgba(255,255,255,0.1)',
          transition: 'background 0.2s', position: 'relative',
        }}>
          <div style={{
            width: '16px', height: '16px', borderRadius: '50%', background: 'rgba(255,255,255,0.85)',
            position: 'absolute', top: '2px', left: checked ? '18px' : '2px', transition: 'left 0.2s',
          }} />
        </div>
      </label>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '8px',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(8px)',
        transition: 'opacity 0.3s cubic-bezier(0.16,1,0.3,1), transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          ...panelStyle,
          width: '100%', maxWidth: '460px',
          maxHeight: 'min(580px, 95vh)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          WebkitAppRegion: 'no-drag',
        } as any}
      >
        {/* ── Header ────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            WebkitAppRegion: 'drag',
          } as any}
        >
          <button
            onClick={handleClose}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '8px',
              padding: '4px 10px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)',
              fontSize: '11px', fontWeight: 500, transition: 'all 0.2s',
              WebkitAppRegion: 'no-drag',
            } as any}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
          >
            <ChevronLeft size={14} /> Back
          </button>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.02em' }}>
            Aura Settings
          </span>
          <div style={{ width: '60px' }} /> {/* Spacer for centering */}
        </div>

        {/* ── Main Body (Sidebar + Content) ─────────────────── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          
          {/* ── Sidebar (Tabs) ──────────────────────────────── */}
          <div className="custom-scrollbar" style={{
            width: '120px', minWidth: '120px',
            display: 'flex', flexDirection: 'column', gap: '4px',
            padding: '12px 8px', borderRight: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(0,0,0,0.15)', overflowY: 'auto'
          }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 12px', borderRadius: '8px', border: 'none',
                  fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.15s',
                  background: activeTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: activeTab === tab.id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)',
                  boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                }}
              >
                {tab.icon}
                <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ── Content ─────────────────────────────────────── */}
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px', minHeight: 0 }}>



          {/* ═══ USER PROFILE ═══ */}
          {activeTab === 'user' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Local User Config */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>
                    <Languages size={11} /> Ngôn ngữ
                  </label>
                  <select name="language" value={localSettings.language || 'vi'} onChange={handleInputChange} style={selectStyle}>
                    <option value="vi">Tiếng Việt</option>
                    <option value="en">English</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Tên trợ lý</label>
                  <input type="text" name="assistantName" value={localSettings.assistantName || 'Aura'} onChange={handleInputChange} style={inputStyle} placeholder="Aura" />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Biệt danh của bạn</label>
                  <input type="text" name="userName" value={localSettings.userName} onChange={handleInputChange} style={inputStyle} placeholder="Ông chủ" />
                </div>
              </div>

              {/* Translator */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '10px' }}>
                <SectionTitle>Phiên dịch trực tiếp</SectionTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>Lang A</label>
                    <select name="translationLangA" value={localSettings.translationLangA || 'vi'} onChange={handleInputChange} style={selectStyle}>
                      {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                    </select>
                  </div>
                  <ArrowRightLeft size={14} style={{ color: 'rgba(255,255,255,0.15)', marginTop: '14px' }} />
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>Lang B</label>
                    <select name="translationLangB" value={localSettings.translationLangB || 'en'} onChange={handleInputChange} style={selectStyle}>
                      {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* File upload */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Knowledge Base (.txt)</label>
                <div
                  style={{
                    border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '10px',
                    padding: '20px', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                >
                  <Upload size={18} style={{ color: 'rgba(255,255,255,0.2)', marginBottom: '6px' }} />
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
                    {localSettings.fileContext ? '✓ File đã tải' : 'Upload .txt'}
                  </span>
                  <input type="file" accept=".txt" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                </div>
              </div>
            </div>
          )}

          {/* ═══ PRESENTATION ═══ */}
          {activeTab === 'presentation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Header */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: '16px', padding: '16px',
                display: 'flex', flexDirection: 'column', gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Monitor size={16} style={{ color: 'rgba(99,102,241,0.9)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.95)' }}>Smart Presentation Mode</span>
                  <span style={{ marginLeft: 'auto', fontSize: '8px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '2px 6px', color: 'rgba(99,102,241,0.8)' }}>DESKTOP ONLY</span>
                </div>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.65', margin: 0 }}>
                  Tải file tài liệu để Aura học nội dung. Trong khi thuyết trình, <strong style={{ color: 'rgba(255,255,255,0.7)' }}>bạn tự bấm phím chuyển slide</strong> — Aura sẽ tự động đọc và thuyết trình mỗi khi phát hiện slide mới.
                </p>

                {/* How it works */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                  {[
                    ['1', 'Tải file PPTX/PDF bên dưới'],
                    ['2', 'Lưu cài đặt, kết nối Aura'],
                    ['3', 'Bật thuyết trình từ Radial Menu (📽️)'],
                    ['4', 'Mở PPTX trong PowerPoint, bấm → để chuyển slide'],
                    ['5', 'Aura tự đọc mỗi khi slide thay đổi 🎤'],
                  ].map(([step, text]) => (
                    <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '9px' }}>
                      <span style={{ minWidth: '16px', height: '16px', borderRadius: '50%', background: 'rgba(99,102,241,0.2)', color: 'rgba(99,102,241,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '8px', flexShrink: 0 }}>{step}</span>
                      <span style={{ color: 'rgba(255,255,255,0.45)', lineHeight: '1.5' }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* File upload */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>
                  Tài liệu thuyết trình <span style={{ color: 'rgba(255,255,255,0.2)' }}>.pptx · .pdf</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="text"
                    name="presentationFilePath"
                    value={localSettings.presentationFilePath || ''}
                    onChange={handleInputChange}
                    placeholder="C:\Users\...\bai_thuyet_trinh.pptx"
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: '10px' }}
                  />
                  <button
                    type="button"
                    onClick={() => pptxInputRef.current?.click()}
                    style={{
                      padding: '8px 12px', background: 'rgba(99,102,241,0.1)',
                      border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px',
                      fontSize: '10px', color: 'rgba(99,102,241,0.8)', cursor: 'pointer',
                      whiteSpace: 'nowrap', fontWeight: 500,
                    }}
                  >
                    📂 Chọn file
                  </button>
                  <input
                    type="file"
                    accept=".pptx,.pdf"
                    ref={pptxInputRef}
                    style={{ display: 'none' }}
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

                {localSettings.presentationFilePath ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '8px', color: 'rgba(52,211,153,0.8)', fontSize: '9px' }}>
                    <ShieldCheck size={11} />
                    <span>Đường dẫn đã lưu — Aura sẽ đọc file này khi bắt đầu thuyết trình.</span>
                  </div>
                ) : (
                  <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '6px' }}>
                    Không bắt buộc — nếu không có file, Aura vẫn thuyết trình từ ảnh màn hình.
                  </p>
                )}
              </div>

              {/* Tip box */}
              <div style={{
                background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.12)',
                borderRadius: '10px', padding: '10px 12px',
              }}>
                <p style={{ fontSize: '9px', color: 'rgba(234,179,8,0.6)', lineHeight: '1.6', margin: 0 }}>
                  💡 <strong>Mẹo:</strong> Để Aura thuyết trình chính xác nhất, hãy mở file PPTX ở chế độ trình chiếu toàn màn hình (F5 trong PowerPoint). Aura sẽ nhận ảnh rõ hơn và đọc nội dung chính xác hơn.
                </p>
              </div>
            </div>
          )}



          {/* ═══ API KEY ═══ */}
          {activeTab === 'key' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)',
                borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Key size={18} style={{ color: 'rgba(168,85,247,0.8)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Google Gemini API Key</span>
                </div>

                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.5' }}>
                  Bạn cung cấp API Key để Aura kết nối trực tiếp đến Google Gemini Live WebSocket (bỏ qua CLIProxyAPI).
                </p>

                {hasSavedKey && !isEditingKey ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShieldCheck size={14} style={{ color: 'rgba(34,197,94,0.8)' }} />
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>••••••••••••••••••••{(settings.apiKey || '').slice(-4)}</span>
                      </div>
                      <button
                        onClick={() => setIsEditingKey(true)}
                        style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', fontSize: '10px', color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}
                      >
                        Đổi Key
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="password"
                      name="apiKey"
                      value={localSettings.apiKey || ''}
                      onChange={handleInputChange}
                      placeholder="AIza..."
                      style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.05em' }}
                    />
                    <div style={{ display: 'flex', gap: '8px', fontSize: '9px' }}>
                      {hasSavedKey && (
                        <button onClick={() => { setIsEditingKey(false); setLocalSettings(prev => ({ ...prev, apiKey: settings.apiKey })); }} style={{ padding: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', flex: 1 }}>Hủy</button>
                      )}
                      <button onClick={() => { if(localSettings.apiKey) { setIsEditingKey(false); handleSave(); } }} style={{ padding: '6px', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '6px', color: 'rgba(168,85,247,0.9)', cursor: 'pointer', flex: 2 }}>Lưu API Key</button>
                    </div>
                  </div>
                )}
              </div>
              
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: 'rgba(56,189,248,0.7)', textDecoration: 'none', alignSelf: 'flex-start' }}>
                <ExternalLink size={10} /> Nhận API Key từ Google AI Studio
              </a>
            </div>
          )}


          {/* ═══ VOICE ═══ */}
          {activeTab === 'voice' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                padding: '10px 12px', background: 'rgba(168,85,247,0.06)',
                border: '1px solid rgba(168,85,247,0.1)', borderRadius: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500, color: 'rgba(168,85,247,0.7)', marginBottom: '2px' }}>
                  <User size={12} /> Định danh người dùng
                </div>
                <p style={{ fontSize: '9px', color: 'rgba(168,85,247,0.4)', lineHeight: '1.5' }}>
                  {assistantName} sẽ ưu tiên giọng nói của bạn và xác nhận giọng lạ.
                </p>
              </div>

              {/* Voice recorder */}
              <div style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
                padding: '16px', border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
              }}>
                {localSettings.userVoiceSample ? (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      color: 'rgba(34,197,94,0.7)', background: 'rgba(34,197,94,0.06)',
                      padding: '6px 14px', borderRadius: '20px', border: '1px solid rgba(34,197,94,0.1)',
                      fontSize: '11px', fontWeight: 500,
                    }}>
                      <ShieldCheck size={13} /> Đã có mẫu
                    </div>
                    <button
                      onClick={() => setLocalSettings(prev => ({ ...prev, userVoiceSample: '' }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '6px 12px', background: 'rgba(255,255,255,0.04)',
                        border: 'none', borderRadius: '8px', fontSize: '10px',
                        color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={12} /> Xóa mẫu
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '50%',
                      background: 'rgba(255,255,255,0.04)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', position: 'relative',
                    }}>
                      {isRecording ? (
                        <div style={{
                          position: 'absolute', inset: 0, border: '2px solid rgba(239,68,68,0.5)',
                          borderRadius: '50%', borderTopColor: 'transparent',
                          animation: 'spin 1s linear infinite',
                        }} />
                      ) : (
                        <Mic size={18} style={{ color: 'rgba(255,255,255,0.25)' }} />
                      )}
                    </div>

                    {isRecording ? (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ fontSize: '10px', textAlign: 'center', color: 'rgba(239,68,68,0.6)' }}>Đang ghi âm...</p>
                        <div style={{ height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: 'rgba(239,68,68,0.5)', width: `${recordProgress}%`, transition: 'width 75ms' }} />
                        </div>
                        <button
                          onClick={() => stopCaptureRef.current?.()}
                          style={{
                            padding: '6px', background: 'rgba(255,255,255,0.04)',
                            border: 'none', borderRadius: '6px', fontSize: '10px',
                            color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                          }}
                        >
                          Dừng sớm
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startRecording}
                        style={{
                          padding: '8px 20px', background: 'rgba(168,85,247,0.12)',
                          border: '1px solid rgba(168,85,247,0.15)', borderRadius: '20px',
                          fontSize: '11px', fontWeight: 500, color: 'rgba(168,85,247,0.8)',
                          cursor: 'pointer',
                        }}
                      >
                        Bắt đầu ghi (4s)
                      </button>
                    )}

                    <p style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
                      Hãy nói: "Chào {assistantName}, tôi là {localSettings.userName || 'chủ nhân'}"
                    </p>

                    {micError && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        color: 'rgba(239,68,68,0.7)', background: 'rgba(239,68,68,0.06)',
                        border: '1px solid rgba(239,68,68,0.1)', borderRadius: '8px',
                        padding: '6px 10px', fontSize: '9px', width: '100%',
                      }}>
                        <AlertCircle size={11} style={{ flexShrink: 0 }} /> {micError}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Sensitivity */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>
                    <Volume2 size={12} /> Độ nhạy Micro
                  </label>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px', color: 'rgba(168,85,247,0.6)' }}>
                    {localSettings.voiceSensitivity?.toFixed(1) || 1.5}x
                  </span>
                </div>
                <input
                  type="range" name="voiceSensitivity" min="0.5" max="5.0" step="0.1"
                  value={localSettings.voiceSensitivity || 1.5} onChange={handleSliderChange}
                  style={{ width: '100%', accentColor: 'rgb(168,85,247)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'rgba(255,255,255,0.15)', marginTop: '2px' }}>
                  <span>Thấp</span><span>Mặc định</span><span>Cao</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══ APPEARANCE ═══ */}
          {activeTab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <SectionTitle>Nhân vật Avatar</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                  {Object.entries(CHARACTER_MODELS).map(([id, char]) => {
                    const isSelected = (localSettings.avatarCharacter || 'haru') === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setLocalSettings(prev => ({ ...prev, avatarCharacter: id as any }))}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                          padding: '8px 4px', borderRadius: '10px',
                          border: isSelected ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.04)',
                          background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize: '18px' }}>{char.emoji}</span>
                        <span style={{ fontSize: '8px', fontWeight: 500, color: isSelected ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }}>{char.name}</span>
                        {isSelected && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', marginTop: '6px' }}>
                  {CHARACTER_MODELS[localSettings.avatarCharacter || 'haru']?.desc}
                </p>
                {localSettings.avatarCharacter === 'custom' && (
                  <div style={{ marginTop: '8px' }}>
                    <label style={{ display: 'block', fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>URL Model (.model3.json)</label>
                    <input type="url" name="live2dModelUrl" value={localSettings.live2dModelUrl || ''} onChange={handleInputChange} placeholder="https://..." style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '10px' }} />
                  </div>
                )}
              </div>

              <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)' }} />

              <div>
                <SectionTitle>Giao diện</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>Theme</label>
                    <select name="appTheme" value={localSettings.appTheme || 'dark'} onChange={handleInputChange} style={selectStyle}>
                      <option value="dark">Dark Mode</option><option value="light">Light Mode</option>
                      <option value="midnight">Midnight Blue</option><option value="cyberpunk">Cyberpunk</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>Background</label>
                    <select name="auraBackground" value={localSettings.auraBackground || 'default'} onChange={handleInputChange} style={selectStyle}>
                      <option value="default">Mặc định</option><option value="office">Văn phòng</option>
                      <option value="anime_room">Phòng Anime</option><option value="scifi">Sci-fi</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SYSTEM ═══ */}
          {activeTab === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Model */}
              <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.1)', borderRadius: '12px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: 'rgba(99,102,241,0.7)', marginBottom: '2px' }}>
                  <Cpu size={13} /> Gemini Live Model
                </div>
                <p style={{ fontSize: '9px', color: 'rgba(99,102,241,0.35)', marginBottom: '8px' }}>Native Audio — streaming thời gian thực.</p>
                <select name="liveModel" value={localSettings.liveModel || 'gemini-2.5-flash-preview-native-audio-dialog'} onChange={handleInputChange} style={selectStyle}>
                  <option value="gemini-2.5-flash-preview-native-audio-dialog">🤖 Gemini 2.5 Flash Native Audio Dialog (AI Agent)</option>
                  <option value="gemini-2.5-flash-native-audio-preview-09-2025">🚀 Gemini 2.5 Flash Native Audio Preview (Stable)</option>
                  <option value="gemini-2.0-flash-live-001">⚡ Gemini 2.0 Flash Live</option>
                </select>
                <p style={{ fontSize: '8px', color: 'rgba(99,102,241,0.3)', marginTop: '6px' }}>
                  💡 Dialog model hỗ trợ AI Agent với khả năng suy luận nâng cao.
                </p>
              </div>

              {/* System Instructions */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>System Instructions</label>
                <textarea
                  name="systemInstruction" value={localSettings.systemInstruction} onChange={handleInputChange}
                  rows={3} style={{ ...inputStyle, resize: 'none', fontFamily: 'monospace', fontSize: '10px' }}
                />
              </div>

              {/* Toggles */}
              <ToggleRow
                icon={<Zap size={13} style={{ color: 'rgba(168,85,247,0.7)' }} />}
                iconColor="rgba(168,85,247,0.08)"
                label="Phản hồi nhanh" desc="Giảm suy nghĩ, trả lời tức thì"
                name="optimizeLatency" checked={localSettings.optimizeLatency || false}
              />
              <ToggleRow
                icon={<Cpu size={13} style={{ color: 'rgba(96,165,250,0.7)' }} />}
                iconColor="rgba(96,165,250,0.08)"
                label="Ưu tiên độ phủ" desc="Giảm hiệu ứng nặng"
                name="optimizeForCoverage" checked={localSettings.optimizeForCoverage !== false}
              />

              {/* Memory */}
              <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '12px', padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ padding: '5px', background: 'rgba(52,211,153,0.06)', borderRadius: '8px' }}>
                      <Brain size={12} style={{ color: 'rgba(52,211,153,0.6)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>Trí nhớ dài hạn</div>
                      <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.25)' }}>{memoryCount} sự kiện</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { if (window.confirm('Xóa toàn bộ ký ức?')) { memoryService.clearAll(); setMemoryCount(0); } }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 8px', background: 'rgba(239,68,68,0.06)',
                      border: '1px solid rgba(239,68,68,0.1)', borderRadius: '6px',
                      fontSize: '9px', color: 'rgba(239,68,68,0.6)', cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={9} /> Xóa
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ ABOUT ═══ */}
          {activeTab === 'about' && (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '8px' }}>
              <div>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '16px', margin: '0 auto 10px',
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.7), rgba(236,72,153,0.7))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px', fontWeight: 700, color: 'white',
                  boxShadow: '0 8px 24px rgba(168,85,247,0.2)',
                }}>
                  {assistantName.charAt(0).toUpperCase()}
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{assistantName} Live</h3>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>Được phát triển bởi DHsystem_LÊ BÁ ĐĂNG HOÀNG</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {['v2.0', 'PIP Overlay', 'Multi-Character'].map((tag, i) => (
                    <span key={i} style={{
                      padding: '2px 8px', borderRadius: '10px', fontSize: '8px',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.4)',
                    }}>{tag}</span>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '10px' }}>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>
                  Bản quyền <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>DHsystem</span>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <button
            onClick={handleClose}
            style={{
              padding: '6px 14px', border: 'none', borderRadius: '8px',
              fontSize: '11px', color: 'rgba(255,255,255,0.4)',
              background: 'transparent', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '6px 18px', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', fontSize: '11px', fontWeight: 600,
              color: 'rgba(255,255,255,0.85)', cursor: 'pointer',
              background: 'rgba(255,255,255,0.08)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.14)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          >
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

// Needed for spin animation
const styleTag = typeof document !== 'undefined' && (() => {
  const exists = document.getElementById('electron-settings-keyframes');
  if (exists) return;
  const style = document.createElement('style');
  style.id = 'electron-settings-keyframes';
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
})();

const SUPPORTED_LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ru', name: 'Русский' },
  { code: 'ko', name: '한국어' },
  { code: 'ja', name: '日本語' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'th', name: 'ไทย' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ar', name: 'العربية' },
];

export default ElectronSettings;
