/**
 * AuraEmotionSticker.tsx — Cute emotion indicators for all Aura states
 *
 * Hiển thị sticker CSS dễ thương theo từng trạng thái EyeState:
 *   IDLE        → Mặt ngủ gật / chờ đợi
 *   LISTENING   → Tai vểnh, sóng âm xung quanh
 *   THINKING    → Bong bóng tư duy, dấu "..."
 *   SPEAKING    → Miệng mở, nốt nhạc nảy
 *   SLEEP       → Zzz nổi lên, trăng lưỡi liềm
 *
 * Dùng được cho cả Desktop (floating widget) lẫn Web (chat card).
 *
 * Props:
 *   state    — EyeState hiện tại
 *   variant  — "badge" (nhỏ, dùng trong header) | "card" (lớn hơn, floating)
 *   name     — Tên trợ lý (default "Aura")
 */

import React, { useState, useEffect, useRef } from "react";
import { EyeState } from "../types";

interface AuraEmotionStickerProps {
  state: EyeState;
  active?: boolean;       // Có đang kết nối Gemini không
  variant?: "badge" | "card";
  name?: string;
}

// ── Emotion configs ───────────────────────────────────────────
const EMOTIONS: Record<EyeState, {
  label: string;
  labelVi: string;
  bgFrom: string;
  bgTo: string;
  borderColor: string;
  pulseColor: string;
  emoji: string;
  tips: string[];
}> = {
  [EyeState.IDLE]: {
    label: "Standby",
    labelVi: "Chờ lệnh",
    bgFrom: "rgba(30,30,50,0.9)",
    bgTo: "rgba(20,20,40,0.9)",
    borderColor: "rgba(100,100,180,0.3)",
    pulseColor: "rgba(100,100,220,0.4)",
    emoji: "💤",
    tips: ["Nhấp vào mình để bắt đầu nói chuyện nhé!", "Mình đang chờ bạn đây~ 🌸", "Gọi mình bất cứ lúc nào!"],
  },
  [EyeState.LISTENING]: {
    label: "Listening",
    labelVi: "Đang nghe...",
    bgFrom: "rgba(20,40,60,0.92)",
    bgTo: "rgba(10,30,50,0.92)",
    borderColor: "rgba(6,182,212,0.5)",
    pulseColor: "rgba(6,182,212,0.5)",
    emoji: "👂",
    tips: ["Mình nghe thấy bạn rồi!", "Cứ nói tự nhiên nhé~", "Mình đang lắng nghe bạn kìa 🎵"],
  },
  [EyeState.THINKING]: {
    label: "Thinking",
    labelVi: "Đang suy nghĩ...",
    bgFrom: "rgba(40,30,60,0.93)",
    bgTo: "rgba(30,20,50,0.93)",
    borderColor: "rgba(167,139,250,0.5)",
    pulseColor: "rgba(167,139,250,0.5)",
    emoji: "🤔",
    tips: ["Để mình nghĩ thêm chút...", "Câu hỏi hay đó! Mình đang xử lý~", "Bộ não đang hoạt động hết công suất! ⚡"],
  },
  [EyeState.SPEAKING]: {
    label: "Speaking",
    labelVi: "Đang trả lời~",
    bgFrom: "rgba(30,50,30,0.92)",
    bgTo: "rgba(20,40,20,0.92)",
    borderColor: "rgba(52,211,153,0.5)",
    pulseColor: "rgba(52,211,153,0.5)",
    emoji: "🗣️",
    tips: ["Nghe mình nói nè!", "Mình đang trả lời bạn đây~", "Hãy lắng nghe nhé! 🎶"],
  },
  [EyeState.SLEEP]: {
    label: "Deep Sleep",
    labelVi: "Ngủ sâu... Zzz",
    bgFrom: "rgba(10,10,30,0.95)",
    bgTo: "rgba(5,5,20,0.95)",
    borderColor: "rgba(79,70,229,0.25)",
    pulseColor: "rgba(79,70,229,0.3)",
    emoji: "🌙",
    tips: ["Zzz... Chạm vào mình để thức dậy nhé!", "Mình đang ngủ đây... 💤", "Ngủ một chút thôi~ Gọi mình khi cần!"],
  },
};

// ── Face SVG for each state ───────────────────────────────────
function AuraFace({ state }: { state: EyeState }) {
  const faceSize = 52;

  if (state === EyeState.SLEEP) return (
    <svg width={faceSize} height={faceSize} viewBox="0 0 52 52">
      {/* Head */}
      <circle cx="26" cy="26" r="22" fill="rgba(79,70,229,0.15)" stroke="rgba(79,70,229,0.3)" strokeWidth="1.5" />
      {/* Sleeping eyes (curved) */}
      <path d="M14 24 Q17 20 20 24" stroke="rgba(167,139,250,0.8)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M32 24 Q35 20 38 24" stroke="rgba(167,139,250,0.8)" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Cute ZZZ */}
      <text x="30" y="18" fontSize="8" fill="rgba(167,139,250,0.6)" fontWeight="bold">z</text>
      <text x="34" y="13" fontSize="6" fill="rgba(167,139,250,0.4)" fontWeight="bold">z</text>
      {/* Mouth smile */}
      <path d="M20 34 Q26 39 32 34" stroke="rgba(167,139,250,0.6)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Blush */}
      <ellipse cx="14" cy="32" rx="5" ry="3" fill="rgba(236,72,153,0.2)" />
      <ellipse cx="38" cy="32" rx="5" ry="3" fill="rgba(236,72,153,0.2)" />
    </svg>
  );

  if (state === EyeState.LISTENING) return (
    <svg width={faceSize} height={faceSize} viewBox="0 0 52 52">
      <circle cx="26" cy="26" r="22" fill="rgba(6,182,212,0.12)" stroke="rgba(6,182,212,0.3)" strokeWidth="1.5" />
      {/* Alert eyes */}
      <ellipse cx="18" cy="23" rx="4" ry="4.5" fill="rgba(6,182,212,0.15)" stroke="rgba(6,182,212,0.7)" strokeWidth="1.5" />
      <ellipse cx="34" cy="23" rx="4" ry="4.5" fill="rgba(6,182,212,0.15)" stroke="rgba(6,182,212,0.7)" strokeWidth="1.5" />
      {/* Pupils */}
      <circle cx="18" cy="23" r="2" fill="rgba(6,182,212,0.9)" />
      <circle cx="34" cy="23" r="2" fill="rgba(6,182,212,0.9)" />
      {/* Shine */}
      <circle cx="19.5" cy="21.5" r="0.8" fill="white" opacity="0.9" />
      <circle cx="35.5" cy="21.5" r="0.8" fill="white" opacity="0.9" />
      {/* Big ears */}
      <ellipse cx="7" cy="24" rx="4" ry="6" fill="rgba(6,182,212,0.2)" stroke="rgba(6,182,212,0.4)" strokeWidth="1.2" />
      <ellipse cx="45" cy="24" rx="4" ry="6" fill="rgba(6,182,212,0.2)" stroke="rgba(6,182,212,0.4)" strokeWidth="1.2" />
      {/* Open mouth (listening) */}
      <path d="M20 33 Q26 37 32 33" stroke="rgba(6,182,212,0.7)" strokeWidth="1.5" fill="rgba(6,182,212,0.08)" strokeLinecap="round" />
      {/* Blush */}
      <ellipse cx="12" cy="30" rx="5" ry="3" fill="rgba(236,72,153,0.2)" />
      <ellipse cx="40" cy="30" rx="5" ry="3" fill="rgba(236,72,153,0.2)" />
    </svg>
  );

  if (state === EyeState.THINKING) return (
    <svg width={faceSize} height={faceSize} viewBox="0 0 52 52">
      <circle cx="26" cy="26" r="22" fill="rgba(124,58,237,0.1)" stroke="rgba(124,58,237,0.3)" strokeWidth="1.5" />
      {/* Squinting eyes (thinking) */}
      <path d="M14 22 Q18 19 22 22" stroke="rgba(167,139,250,0.9)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M30 22 Q34 19 38 22" stroke="rgba(167,139,250,0.9)" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Thinking brow (raised one side) */}
      <path d="M14 18 Q18 16 22 18" stroke="rgba(167,139,250,0.6)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M30 17 Q34 15 38 18" stroke="rgba(167,139,250,0.6)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Awkward mouth */}
      <path d="M20 34 Q23 32 26 33 Q29 34 32 32" stroke="rgba(167,139,250,0.7)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Thought bubble dots */}
      <circle cx="35" cy="10" r="1.5" fill="rgba(167,139,250,0.5)">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite" begin="0s" />
      </circle>
      <circle cx="39" cy="7" r="2" fill="rgba(167,139,250,0.4)">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite" begin="0.4s" />
      </circle>
      <circle cx="44" cy="4" r="2.5" fill="rgba(167,139,250,0.3)">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite" begin="0.8s" />
      </circle>
      {/* Blush */}
      <ellipse cx="13" cy="31" rx="5" ry="3" fill="rgba(236,72,153,0.15)" />
      <ellipse cx="39" cy="31" rx="5" ry="3" fill="rgba(236,72,153,0.15)" />
    </svg>
  );

  if (state === EyeState.SPEAKING) return (
    <svg width={faceSize} height={faceSize} viewBox="0 0 52 52">
      <circle cx="26" cy="26" r="22" fill="rgba(16,185,129,0.1)" stroke="rgba(52,211,153,0.35)" strokeWidth="1.5" />
      {/* Happy eyes (arched) */}
      <path d="M14 22 Q18 17 22 22" stroke="rgba(52,211,153,0.9)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M30 22 Q34 17 38 22" stroke="rgba(52,211,153,0.9)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Big open mouth speaking */}
      <ellipse cx="26" cy="35" rx="8" ry="5" fill="rgba(52,211,153,0.15)" stroke="rgba(52,211,153,0.6)" strokeWidth="1.5" />
      {/* Tongue */}
      <ellipse cx="26" cy="37" rx="3.5" ry="2" fill="rgba(236,72,153,0.4)" />
      {/* Music notes */}
      <text x="36" y="16" fontSize="8" fill="rgba(52,211,153,0.7)">♪</text>
      <text x="8" y="14" fontSize="6" fill="rgba(52,211,153,0.5)">♫</text>
      {/* Blush - brightened when speaking */}
      <ellipse cx="11" cy="30" rx="6" ry="3.5" fill="rgba(236,72,153,0.3)" />
      <ellipse cx="41" cy="30" rx="6" ry="3.5" fill="rgba(236,72,153,0.3)" />
    </svg>
  );

  // IDLE
  return (
    <svg width={faceSize} height={faceSize} viewBox="0 0 52 52">
      <circle cx="26" cy="26" r="22" fill="rgba(51,51,80,0.2)" stroke="rgba(100,100,160,0.3)" strokeWidth="1.5" />
      {/* Half-closed eyes (idle/drowsy) */}
      <ellipse cx="18" cy="24" rx="4" ry="2.5" fill="rgba(139,92,246,0.12)" stroke="rgba(139,92,246,0.5)" strokeWidth="1.3" />
      <ellipse cx="34" cy="24" rx="4" ry="2.5" fill="rgba(139,92,246,0.12)" stroke="rgba(139,92,246,0.5)" strokeWidth="1.3" />
      <rect x="14" y="23" width="8" height="3.5" fill="rgba(10,10,30,0.8)" rx="1" />
      <rect x="30" y="23" width="8" height="3.5" fill="rgba(10,10,30,0.8)" rx="1" />
      {/* Pupils small */}
      <circle cx="18" cy="24.5" r="1.5" fill="rgba(139,92,246,0.8)" />
      <circle cx="34" cy="24.5" r="1.5" fill="rgba(139,92,246,0.8)" />
      {/* Neutral mouth */}
      <path d="M20 34 Q26 36 32 34" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Light blush */}
      <ellipse cx="13" cy="31" rx="5" ry="2.5" fill="rgba(236,72,153,0.12)" />
      <ellipse cx="39" cy="31" rx="5" ry="2.5" fill="rgba(236,72,153,0.12)" />
    </svg>
  );
}

// ── Sound wave bars (for LISTENING) ──────────────────────────
function SoundBars({ active, color }: { active: boolean; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 20 }}>
      {[0.4, 1, 0.7, 0.9, 0.5, 0.8, 0.6].map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            background: color,
            height: active ? `${h * 18}px` : "3px",
            transition: "height 0.3s ease",
            animation: active ? `soundbar-${i} ${0.6 + i * 0.1}s ease-in-out infinite alternate` : "none",
            opacity: active ? 0.8 : 0.3,
          }}
        />
      ))}
      <style>{`
        @keyframes soundbar-0 { from { height: 4px; } to { height: 14px; } }
        @keyframes soundbar-1 { from { height: 10px; } to { height: 20px; } }
        @keyframes soundbar-2 { from { height: 6px; } to { height: 16px; } }
        @keyframes soundbar-3 { from { height: 12px; } to { height: 20px; } }
        @keyframes soundbar-4 { from { height: 4px; } to { height: 12px; } }
        @keyframes soundbar-5 { from { height: 8px; } to { height: 18px; } }
        @keyframes soundbar-6 { from { height: 5px; } to { height: 14px; } }
      `}</style>
    </div>
  );
}

// ── Thinking dots ─────────────────────────────────────────────
function ThinkingDots({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: color,
          animation: `think-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes think-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Speaking bars ─────────────────────────────────────────────
function SpeakingBars({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {[0.6, 1, 0.8, 1, 0.7].map((h, i) => (
        <div key={i} style={{
          width: 4, height: `${h * 14}px`, borderRadius: 2,
          background: color,
          animation: `speak-bar 0.8s ease-in-out ${i * 0.12}s infinite alternate`,
        }} />
      ))}
      <style>{`
        @keyframes speak-bar {
          from { transform: scaleY(0.4); opacity: 0.6; }
          to { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Tip rotator ───────────────────────────────────────────────
function useTip(tips: string[], intervalMs = 3500) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % tips.length);
        setVisible(true);
      }, 300);
    }, intervalMs);
    return () => clearInterval(t);
  }, [tips, intervalMs]);
  return { tip: tips[idx], visible };
}

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════
const AuraEmotionSticker: React.FC<AuraEmotionStickerProps> = ({
  state,
  active = false,
  variant = "badge",
  name = "Aura",
}) => {
  const emotion = EMOTIONS[state] ?? EMOTIONS[EyeState.IDLE];
  const { tip, visible } = useTip(emotion.tips);

  // ── BADGE variant (compact pill for header/drag-bar) ─────
  if (variant === "badge") {
    return (
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px 3px 5px",
        borderRadius: 99,
        background: `rgba(0,0,0,0.45)`,
        border: `1px solid ${emotion.borderColor}`,
        backdropFilter: "blur(16px)",
        boxShadow: `0 0 8px ${emotion.pulseColor}40`,
        fontSize: 10,
        fontWeight: 600,
        color: "rgba(226,232,240,0.75)",
        letterSpacing: "0.05em",
        userSelect: "none",
        transition: "all 0.35s ease",
        whiteSpace: "nowrap",
      }}>
        {/* Emoji icon */}
        <span style={{ fontSize: 13, lineHeight: 1 }}>{emotion.emoji}</span>
        {/* Animated indicator matching state */}
        {state === EyeState.LISTENING && <SoundBars active color={emotion.pulseColor} />}
        {state === EyeState.THINKING && <ThinkingDots color={emotion.pulseColor} />}
        {state === EyeState.SPEAKING && <SpeakingBars color={emotion.pulseColor} />}
        {(state === EyeState.IDLE || state === EyeState.SLEEP) && (
          <span style={{
            display: "inline-block",
            width: 5, height: 5,
            borderRadius: "50%",
            background: emotion.pulseColor,
            animation: "badge-idle-dot 2s ease-in-out infinite",
          }} />
        )}
        {/* State label — kept short */}
        <span style={{ color: emotion.pulseColor, fontSize: 10 }}>{emotion.labelVi}</span>
        <style>{`
          @keyframes badge-idle-dot {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.3); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // ── CARD variant (floating sticker popup) ────────────────
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "14px 18px",
        borderRadius: 20,
        background: `linear-gradient(145deg, ${emotion.bgFrom}, ${emotion.bgTo})`,
        border: `1px solid ${emotion.borderColor}`,
        backdropFilter: "blur(20px)",
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${emotion.pulseColor}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        minWidth: 140,
        maxWidth: 190,
        transition: "all 0.5s cubic-bezier(0.34,1.56,0.64,1)",
        userSelect: "none",
        animation: "sticker-appear 0.4s cubic-bezier(0.34,1.56,0.64,1)",
      }}
    >
      {/* Pulse ring */}
      <div style={{
        position: "absolute",
        inset: -2,
        borderRadius: 22,
        border: `1px solid ${emotion.pulseColor}`,
        opacity: 0.4,
        animation: "sticker-pulse-ring 2.5s ease-in-out infinite",
        pointerEvents: "none",
      }} />

      {/* Avatar face */}
      <div style={{
        position: "relative",
        animation: state === EyeState.SPEAKING ? "sticker-bounce 0.5s ease-in-out infinite alternate"
          : state === EyeState.THINKING ? "sticker-sway 2s ease-in-out infinite"
          : state === EyeState.SLEEP ? "sticker-float 4s ease-in-out infinite"
          : "none",
      }}>
        <AuraFace state={state} />
      </div>

      {/* Emotion indicator */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}>
        {state === EyeState.LISTENING && <SoundBars active color={emotion.pulseColor} />}
        {state === EyeState.THINKING && <ThinkingDots color={emotion.pulseColor} />}
        {state === EyeState.SPEAKING && <SpeakingBars color={emotion.pulseColor} />}
        {(state === EyeState.IDLE || state === EyeState.SLEEP) && (
          <div style={{
            display: "flex",
            gap: 3,
          }}>
            {state === EyeState.SLEEP
              ? ["Z", "z", "z"].map((z, i) => (
                  <span key={i} style={{
                    fontSize: 10 + (2 - i) * 2,
                    color: emotion.pulseColor,
                    fontWeight: 700,
                    animation: `zzz-float ${1 + i * 0.4}s ease-in-out ${i * 0.3}s infinite`,
                    opacity: 0.8,
                  }}>{z}</span>
                ))
              : <div style={{ width: 28, height: 2, borderRadius: 1, background: `${emotion.pulseColor}`, opacity: 0.4 }} />
            }
          </div>
        )}

        {/* State label */}
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: emotion.pulseColor,
        }}>
          {emotion.labelVi}
        </span>

        {/* Tip text */}
        <div style={{
          padding: "5px 10px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          width: "100%",
        }}>
          <p style={{
            fontSize: 10,
            color: "rgba(203,213,225,0.6)",
            textAlign: "center",
            lineHeight: 1.5,
            margin: 0,
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(4px)",
            transition: "opacity 0.3s ease, transform 0.3s ease",
          }}>
            {tip}
          </p>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes sticker-appear {
          from { opacity: 0; transform: scale(0.7) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes sticker-pulse-ring {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.04); opacity: 0.15; }
        }
        @keyframes sticker-bounce {
          from { transform: translateY(0px) rotate(-1deg); }
          to { transform: translateY(-3px) rotate(1deg); }
        }
        @keyframes sticker-sway {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
        @keyframes sticker-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes zzz-float {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
          50% { transform: translate(2px, -5px) scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default AuraEmotionSticker;
