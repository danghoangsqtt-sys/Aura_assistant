/**
 * SplashScreen.tsx — Game-Style Intro Screen (Electron Only)
 *
 * Flow:
 *   Phase 1 "intro"   — Logo xuất hiện, thông tin tác giả, nút "Bắt Đầu"
 *   Phase 2 "loading" — Loading bar hoành tráng kiểu game, tips ngẫu nhiên
 *   Phase 3 "done"    — Fade out toàn màn hình → gọi onComplete()
 */

import React, { useState, useEffect, useRef } from "react";
// Import ảnh qua Vite để path được giải quyết đúng cả trong dev lẫn production (file:// protocol)
import auraLogoUrl from "/aura_npc_logo.png";

interface SplashScreenProps {
  onComplete: () => void;
}

// ── Danh sách "Loading Tips" kiểu game ──────────────────────
const LOADING_TIPS = [
  "💡 Gợi ý: Giữ Ctrl+Shift+A để ẩn/hiện Aura bất cứ lúc nào.",
  "🎙️ Aura nghe rất nhạy — hãy nói tự nhiên như với người bạn.",
  "👁️ Bật Screen Vision để Aura quan sát và hỗ trợ ngữ cảnh màn hình.",
  "🌐 Aura có thể mở YouTube, Zing MP3 và tìm kiếm Google bằng giọng nói.",
  "🔒 API Key được mã hóa AES trước khi lưu vào máy của bạn.",
  "🖱️ Cuộn chuột lên/xuống để thay đổi kích thước Aura.",
  "💤 Aura sẽ vào chế độ ngủ sâu nếu không có hoạt động trong một thời gian.",
  "📸 Camera Vision cho phép Aura nhìn thấy qua webcam của bạn.",
];

// ── Loading Steps (mô phỏng khởi động hệ thống) ─────────────
const LOADING_STEPS = [
  { label: "Khởi tạo lõi AI...", duration: 600 },
  { label: "Nạp mô hình Live2D...", duration: 700 },
  { label: "Kết nối Gemini Live API...", duration: 800 },
  { label: "Cấu hình Voice Activity Detector...", duration: 500 },
  { label: "Khởi động Audio Pipeline...", duration: 600 },
  { label: "Chuẩn bị Ý thức Nhân tạo...", duration: 900 },
  { label: "Sẵn sàng.", duration: 400 },
];

type Phase = "intro" | "loading" | "fadeout";

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<Phase>("intro");
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState(LOADING_STEPS[0].label);
  const [tip, setTip] = useState(LOADING_TIPS[0]);
  const [logoVisible, setLogoVisible] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const progressRef = useRef(0);

  // ── Staggered intro animation ──────────────────────────────
  useEffect(() => {
    const t1 = setTimeout(() => setLogoVisible(true), 300);
    const t2 = setTimeout(() => setContentVisible(true), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // ── Random tip rotation during loading ────────────────────
  useEffect(() => {
    if (phase !== "loading") return;
    const idx = Math.floor(Math.random() * LOADING_TIPS.length);
    setTip(LOADING_TIPS[idx]);
    const interval = setInterval(() => {
      setTip(LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]);
    }, 2800);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Loading sequence ──────────────────────────────────────
  useEffect(() => {
    if (phase !== "loading") return;

    let currentStep = 0;
    let elapsed = 0;
    const totalDuration = LOADING_STEPS.reduce((sum, s) => sum + s.duration, 0);

    const runStep = () => {
      if (currentStep >= LOADING_STEPS.length) {
        // All steps done → fade out
        setTimeout(() => {
          setFadeOut(true);
          setTimeout(onComplete, 700);
        }, 300);
        return;
      }

      const step = LOADING_STEPS[currentStep];
      setStepLabel(step.label);

      // Animate progress bar smoothly over step.duration
      const stepStart = elapsed;
      const stepEnd = elapsed + step.duration;
      const startPct = (stepStart / totalDuration) * 100;
      const endPct = (stepEnd / totalDuration) * 100;
      const frames = Math.round(step.duration / 16);

      let frame = 0;
      const animate = setInterval(() => {
        frame++;
        const pct = startPct + ((endPct - startPct) * frame) / frames;
        progressRef.current = pct;
        setProgress(Math.min(pct, 100));
        if (frame >= frames) {
          clearInterval(animate);
        }
      }, 16);

      elapsed = stepEnd;
      currentStep++;
      setTimeout(runStep, step.duration);
    };

    runStep();
  }, [phase, onComplete]);

  // ── Start loading when button clicked ────────────────────
  const handleStart = () => {
    setPhase("loading");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "#030308",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        overflow: "hidden",
        opacity: fadeOut ? 0 : 1,
        transition: fadeOut ? "opacity 0.7s ease" : "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* ── Animated Background ── */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {/* Particle grid */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.04 }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#8b5cf6" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Ambient orbs */}
        <div style={{
          position: "absolute", width: 350, height: 350,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)",
          top: "-10%", left: "-5%",
          animation: "splash-float1 10s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", width: 280, height: 280,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6,182,212,0.14) 0%, transparent 70%)",
          bottom: "5%", right: "-5%",
          animation: "splash-float2 13s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", width: 200, height: 200,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(236,72,153,0.1) 0%, transparent 70%)",
          top: "55%", left: "60%",
          animation: "splash-float3 9s ease-in-out infinite",
        }} />
      </div>

      {/* ── Scanline overlay ── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        zIndex: 1,
      }} />

      {/* ════════════════════════════════════════════
          PHASE: INTRO
      ════════════════════════════════════════════ */}
      {phase === "intro" && (
        <div style={{
          position: "relative", zIndex: 2,
          display: "flex", flexDirection: "column",
          alignItems: "center", textAlign: "center",
          padding: "clamp(0.75rem, 3vh, 2rem) clamp(1rem, 5vw, 2rem)",
          width: "100%", maxWidth: 380,
          boxSizing: "border-box",
          gap: 0,
          /* Allow scroll nếu window quá nhỏ */
          overflowY: "auto", maxHeight: "100vh",
        }}>
          {/* Studio Tag */}
          <div style={{
            opacity: logoVisible ? 1 : 0,
            transform: logoVisible ? "translateY(0)" : "translateY(-10px)",
            transition: "all 0.6s ease",
            marginBottom: "clamp(0.5rem, 2vh, 1.5rem)",
          }}>
            <span style={{
              fontSize: "clamp(0.5rem, 1.5vmin, 0.6rem)", letterSpacing: "0.3em",
              textTransform: "uppercase", color: "rgba(139,92,246,0.5)",
              fontWeight: 600,
            }}>
              DH SYSTEM PRESENTS
            </span>
          </div>

          {/* Logo Ring */}
          <div style={{
            opacity: logoVisible ? 1 : 0,
            transform: logoVisible ? "scale(1) translateY(0)" : "scale(0.7) translateY(20px)",
            transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
            marginBottom: "clamp(0.5rem, 2vh, 1.5rem)",
          }}>
            {/* Outer glow ring */}
            <div style={{
              position: "relative",
              width: "clamp(72px, 18vmin, 110px)",
              height: "clamp(72px, 18vmin, 110px)",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {/* Rotating ring */}
              <div style={{
                position: "absolute", inset: -4,
                borderRadius: "50%",
                border: "2px solid transparent",
                borderTopColor: "rgba(139,92,246,0.8)",
                borderRightColor: "rgba(6,182,212,0.4)",
                animation: "splash-spin 3s linear infinite",
              }} />
              <div style={{
                position: "absolute", inset: -8,
                borderRadius: "50%",
                border: "1px solid transparent",
                borderBottomColor: "rgba(236,72,153,0.4)",
                borderLeftColor: "rgba(139,92,246,0.2)",
                animation: "splash-spin 7s linear infinite reverse",
              }} />

              {/* Logo image */}
              <div style={{
                width: "clamp(64px, 16vmin, 100px)",
                height: "clamp(64px, 16vmin, 100px)",
                borderRadius: "50%",
                overflow: "hidden",
                background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.2))",
                border: "2px solid rgba(139,92,246,0.35)",
                boxShadow: "0 0 40px rgba(139,92,246,0.3), inset 0 0 20px rgba(139,92,246,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "splash-pulse 3s ease-in-out infinite",
              }}>
                <img
                  src={auraLogoUrl}
                  alt="Aura"
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                  onError={(e) => {
                    // Fallback nếu ảnh không load
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.innerHTML = `
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.9)" strokeWidth="1.5">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                      </svg>`;
                  }}
                />
              </div>
            </div>
          </div>

          {/* App Name */}
          <div style={{
            opacity: logoVisible ? 1 : 0,
            transform: logoVisible ? "translateY(0)" : "translateY(15px)",
            transition: "all 0.7s ease 0.2s",
          }}>
            <h1 style={{
              margin: "0 0 0.2rem",
              fontSize: "clamp(1.8rem, 8vmin, 2.8rem)", fontWeight: 800,
              letterSpacing: "0.12em",
              background: "linear-gradient(135deg, #e2e8f0 30%, #a78bfa 70%, #67e8f9 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              AURA
            </h1>
            <p style={{
              margin: 0,
              fontSize: "clamp(0.5rem, 1.5vmin, 0.65rem)", fontWeight: 600,
              letterSpacing: "0.25em", textTransform: "uppercase",
              color: "rgba(148,163,184,0.6)",
            }}>
              AI Voice Assistant
            </p>
          </div>

          {/* Divider */}
          <div style={{
            width: contentVisible ? "clamp(120px, 50%, 200px)" : 0, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.5), transparent)",
            margin: "clamp(0.75rem, 2.5vh, 1.5rem) 0",
            transition: "width 0.8s ease",
          }} />

          {/* Author Info */}
          <div style={{
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.6s ease",
            marginBottom: "clamp(0.75rem, 2.5vh, 2rem)",
            width: "100%",
          }}>
            <div style={{
              padding: "clamp(0.6rem, 2vh, 1rem) clamp(0.75rem, 3vw, 1.25rem)",
              borderRadius: "1rem",
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(139,92,246,0.15)",
              backdropFilter: "blur(10px)",
            }}>
              <div style={{ marginBottom: "0.5rem" }}>
                <span style={{
                  fontSize: "clamp(0.5rem, 1.3vmin, 0.6rem)", letterSpacing: "0.2em",
                  textTransform: "uppercase", color: "rgba(139,92,246,0.6)",
                  fontWeight: 600,
                }}>
                  DEVELOPED BY
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: "center" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.75rem", fontWeight: 700, color: "white",
                  flexShrink: 0,
                }}>
                  DH
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{
                    fontSize: "clamp(0.75rem, 2.2vmin, 0.85rem)", fontWeight: 600,
                    color: "rgba(226,232,240,0.9)", letterSpacing: "0.02em",
                  }}>
                    Đăng Hoàng
                  </div>
                  <div style={{
                    fontSize: "clamp(0.6rem, 1.8vmin, 0.7rem)", color: "rgba(148,163,184,0.55)",
                    letterSpacing: "0.05em",
                  }}>
                    DH System · 2025–2026
                  </div>
                </div>
              </div>
              <div style={{
                marginTop: "0.5rem", paddingTop: "0.5rem",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                fontSize: "clamp(0.55rem, 1.5vmin, 0.65rem)", color: "rgba(148,163,184,0.4)",
                letterSpacing: "0.04em", lineHeight: 1.6,
              }}>
                Powered by Google Gemini Live API
                <br />
                Built with Electron · React · TypeScript
              </div>
            </div>
          </div>

          {/* Start Button */}
          <div style={{
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? "translateY(0)" : "translateY(15px)",
            transition: "all 0.6s ease 0.15s",
            width: "100%",
          }}>
            <button
              onClick={handleStart}
              style={{
                width: "100%",
                padding: "clamp(0.6rem, 2vh, 0.9rem) 1.5rem",
                borderRadius: "0.875rem",
                border: "none",
                cursor: "pointer",
                fontSize: "clamp(0.75rem, 2.2vmin, 0.875rem)",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontFamily: "inherit",
                background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 50%, #06b6d4 100%)",
                backgroundSize: "200% 200%",
                color: "white",
                boxShadow: "0 4px 24px rgba(124,58,237,0.4), 0 0 0 1px rgba(139,92,246,0.3)",
                transition: "all 0.3s ease",
                animation: "splash-btn-glow 3s ease-in-out infinite",
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 40px rgba(124,58,237,0.6), 0 0 0 1px rgba(139,92,246,0.5)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 24px rgba(124,58,237,0.4), 0 0 0 1px rgba(139,92,246,0.3)";
              }}
            >
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                </svg>
                Bắt Đầu
              </span>
            </button>
            <p style={{
              marginTop: "clamp(0.4rem, 1.2vh, 0.75rem)",
              fontSize: "clamp(0.5rem, 1.3vmin, 0.6rem)", color: "rgba(148,163,184,0.35)",
              letterSpacing: "0.06em",
            }}>
              VERSION 1.0.0 · DH SYSTEM
            </p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          PHASE: LOADING (Game-style cinematic)
      ════════════════════════════════════════════ */}
      {phase === "loading" && (
        <div style={{
          position: "relative", zIndex: 2,
          display: "flex", flexDirection: "column",
          alignItems: "center", width: "100%",
          padding: "2rem",
          animation: "splash-fadein 0.4s ease",
        }}>
          {/* Logo small on top */}
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            overflow: "hidden",
            background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.2))",
            border: "2px solid rgba(139,92,246,0.4)",
            boxShadow: "0 0 30px rgba(139,92,246,0.3)",
            marginBottom: "1.5rem",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <img
              src={auraLogoUrl}
              alt="Aura"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>

          {/* Title */}
          <h2 style={{
            margin: "0 0 0.25rem",
            fontSize: "1.5rem", fontWeight: 800, letterSpacing: "0.15em",
            background: "linear-gradient(135deg, #e2e8f0, #a78bfa)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            AURA
          </h2>
          <p style={{
            margin: "0 0 2.5rem",
            fontSize: "0.6rem", letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(148,163,184,0.5)", fontWeight: 600,
          }}>
            Đang Khởi Động Hệ Thống
          </p>

          {/* Progress Bar Container */}
          <div style={{ width: "100%", maxWidth: 320 }}>
            {/* Step label */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              marginBottom: "0.5rem",
            }}>
              <span style={{
                fontSize: "0.7rem", color: "rgba(139,92,246,0.8)",
                fontWeight: 500, letterSpacing: "0.04em",
                animation: "splash-fadein 0.3s ease",
              }}>
                {stepLabel}
              </span>
              <span style={{
                fontSize: "0.7rem", color: "rgba(148,163,184,0.5)",
                fontWeight: 600,
              }}>
                {Math.round(progress)}%
              </span>
            </div>

            {/* Progress Track */}
            <div style={{
              width: "100%", height: 4,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 4,
              overflow: "hidden",
              position: "relative",
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
            }}>
              {/* Progress fill */}
              <div style={{
                height: "100%",
                width: `${progress}%`,
                background: "linear-gradient(90deg, #7c3aed, #06b6d4)",
                borderRadius: 4,
                transition: "width 0.08s linear",
                position: "relative",
                boxShadow: "0 0 12px rgba(139,92,246,0.6)",
              }}>
                {/* Shimmer effect */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)",
                  animation: "splash-shimmer 1.2s linear infinite",
                }} />
              </div>
            </div>

            {/* Segment ticks (like game loading bar) */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              marginTop: "0.3rem", paddingLeft: "0.1rem", paddingRight: "0.1rem",
            }}>
              {Array.from({ length: LOADING_STEPS.length }).map((_, i) => {
                const pct = ((i + 1) / LOADING_STEPS.length) * 100;
                return (
                  <div key={i} style={{
                    width: 2, height: 6,
                    background: progress >= pct
                      ? "rgba(139,92,246,0.8)"
                      : "rgba(255,255,255,0.08)",
                    borderRadius: 1,
                    transition: "background 0.3s ease",
                  }} />
                );
              })}
            </div>
          </div>

          {/* Loading tip */}
          <div style={{
            marginTop: "2.5rem",
            padding: "0.75rem 1.25rem",
            borderRadius: "0.75rem",
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
            maxWidth: 300,
            width: "100%",
            animation: "splash-fadein 0.5s ease",
          }}>
            <div style={{
              fontSize: "0.6rem", letterSpacing: "0.15em",
              textTransform: "uppercase", color: "rgba(139,92,246,0.5)",
              marginBottom: "0.5rem", fontWeight: 600,
            }}>
              MẸO
            </div>
            <p style={{
              margin: 0, fontSize: "0.72rem",
              color: "rgba(203,213,225,0.65)",
              lineHeight: 1.6, letterSpacing: "0.01em",
            }}>
              {tip}
            </p>
          </div>

          {/* Animated dots */}
          <div style={{
            display: "flex", gap: "0.4rem",
            marginTop: "2rem",
          }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "rgba(139,92,246,0.7)",
                animation: `splash-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Global Keyframes ── */}
      <style>{`
        @keyframes splash-float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, -30px) scale(1.05); }
        }
        @keyframes splash-float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-25px, 20px) scale(0.95); }
        }
        @keyframes splash-float3 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(15px, -15px); }
        }
        @keyframes splash-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes splash-pulse {
          0%, 100% { box-shadow: 0 0 40px rgba(139,92,246,0.3), inset 0 0 20px rgba(139,92,246,0.1); }
          50% { box-shadow: 0 0 70px rgba(139,92,246,0.5), inset 0 0 30px rgba(139,92,246,0.2); }
        }
        @keyframes splash-btn-glow {
          0%, 100% { box-shadow: 0 4px 24px rgba(124,58,237,0.4), 0 0 0 1px rgba(139,92,246,0.3); }
          50% { box-shadow: 0 4px 40px rgba(124,58,237,0.65), 0 0 0 1px rgba(139,92,246,0.5); }
        }
        @keyframes splash-shimmer {
          from { transform: translateX(-100%); }
          to { transform: translateX(200%); }
        }
        @keyframes splash-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes splash-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;
