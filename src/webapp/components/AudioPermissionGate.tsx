/**
 * AudioPermissionGate.tsx — Web Audio Permission Flow
 *
 * Trên browser, AudioContext bắt buộc phải được resume() sau user gesture.
 * Component này hiển thị full-screen overlay yêu cầu user click trước khi
 * vào AppWeb, đảm bảo AudioContext + Microphone permission đều sẵn sàng.
 *
 * Flow:
 *   1. Hiển thị branding overlay + nút CTA
 *   2. User click → resume AudioContext + getUserMedia (optional warm-up)
 *   3. Thành công → gọi onGranted() → ẩn overlay
 *   4. Thất bại → hiển thị hướng dẫn
 */

import React, { useState, useCallback } from "react";
import { Mic, Volume2, AlertTriangle, Sparkles } from "lucide-react";

interface AudioPermissionGateProps {
  onGranted: () => void;
  assistantName?: string;
}

const AudioPermissionGate: React.FC<AudioPermissionGateProps> = ({
  onGranted,
  assistantName = "Aura",
}) => {
  const [status, setStatus] = useState<"idle" | "requesting" | "denied">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleUnlock = useCallback(async () => {
    setStatus("requesting");
    setErrorMsg("");

    try {
      // Step 1: Unlock AudioContext (required by browser autoplay policy)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 24000 });
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      // Close this temporary context — the app will create its own
      await ctx.close();

      // Step 2: Warm-up microphone permission (optional, graceful failure)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        // Stop tracks immediately — just needed to trigger permission prompt
        stream.getTracks().forEach((t) => t.stop());
      } catch (micErr: any) {
        // Microphone denied but AudioContext is unlocked — still allow entry
        // User can grant mic later when they activate voice mode
        console.warn("[AudioPermissionGate] Mic permission skipped:", micErr.message);
      }

      // Success — AudioContext is unlocked
      setStatus("idle");
      onGranted();
    } catch (err: any) {
      console.error("[AudioPermissionGate] Failed:", err);
      setStatus("denied");
      setErrorMsg(
        err.message || "Không thể khởi tạo âm thanh. Hãy kiểm tra cài đặt trình duyệt."
      );
    }
  }, [onGranted]);

  return (
    <div className="audio-gate-overlay">
      {/* Animated background */}
      <div className="audio-gate-bg">
        <div className="audio-gate-orb audio-gate-orb-1" />
        <div className="audio-gate-orb audio-gate-orb-2" />
        <div className="audio-gate-orb audio-gate-orb-3" />
      </div>

      {/* Content */}
      <div className="audio-gate-content">
        {/* Logo / Branding */}
        <div className="audio-gate-logo">
          <div className="audio-gate-logo-ring">
            <Sparkles size={32} className="audio-gate-logo-icon" />
          </div>
        </div>

        <h1 className="audio-gate-title">{assistantName}</h1>
        <p className="audio-gate-subtitle">AI Voice Assistant</p>

        {/* Status-based content */}
        {status === "denied" ? (
          <div className="audio-gate-error">
            <AlertTriangle size={20} className="audio-gate-error-icon" />
            <p className="audio-gate-error-text">{errorMsg}</p>
            <p className="audio-gate-error-hint">
              Hãy cho phép quyền truy cập Microphone trong cài đặt trình duyệt,
              sau đó tải lại trang.
            </p>
            <button onClick={handleUnlock} className="audio-gate-btn audio-gate-btn-retry">
              Thử Lại
            </button>
          </div>
        ) : (
          <div className="audio-gate-cta">
            <div className="audio-gate-features">
              <div className="audio-gate-feature">
                <Volume2 size={16} />
                <span>Phát âm thanh phản hồi</span>
              </div>
              <div className="audio-gate-feature">
                <Mic size={16} />
                <span>Trò chuyện bằng giọng nói</span>
              </div>
            </div>

            <button
              onClick={handleUnlock}
              disabled={status === "requesting"}
              className="audio-gate-btn audio-gate-btn-start"
            >
              {status === "requesting" ? (
                <span className="audio-gate-btn-loading">
                  <span className="audio-gate-spinner" />
                  Đang khởi tạo...
                </span>
              ) : (
                <span className="audio-gate-btn-label">
                  <Sparkles size={18} />
                  Bắt Đầu Trò Chuyện
                </span>
              )}
            </button>

            <p className="audio-gate-note">
              Trình duyệt yêu cầu bạn nhấn nút để cho phép phát âm thanh
            </p>
          </div>
        )}
      </div>

      <style>{`
        .audio-gate-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #050508;
          font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
          overflow: hidden;
        }

        /* Animated background orbs */
        .audio-gate-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .audio-gate-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.4;
          animation: audio-gate-float 8s ease-in-out infinite;
        }

        .audio-gate-orb-1 {
          width: 300px;
          height: 300px;
          background: rgba(139, 92, 246, 0.3);
          top: 10%;
          left: 20%;
          animation-delay: 0s;
        }

        .audio-gate-orb-2 {
          width: 250px;
          height: 250px;
          background: rgba(6, 182, 212, 0.25);
          bottom: 15%;
          right: 15%;
          animation-delay: -3s;
        }

        .audio-gate-orb-3 {
          width: 200px;
          height: 200px;
          background: rgba(236, 72, 153, 0.2);
          top: 50%;
          left: 60%;
          animation-delay: -5s;
        }

        @keyframes audio-gate-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }

        /* Content container */
        .audio-gate-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 2rem;
          max-width: 400px;
          animation: audio-gate-fadein 0.8s ease-out;
        }

        @keyframes audio-gate-fadein {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Logo */
        .audio-gate-logo {
          margin-bottom: 1.5rem;
        }

        .audio-gate-logo-ring {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2));
          border: 2px solid rgba(139, 92, 246, 0.3);
          box-shadow: 0 0 40px rgba(139, 92, 246, 0.15), inset 0 0 20px rgba(139, 92, 246, 0.1);
          animation: audio-gate-pulse 3s ease-in-out infinite;
        }

        @keyframes audio-gate-pulse {
          0%, 100% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.15), inset 0 0 20px rgba(139, 92, 246, 0.1); }
          50% { box-shadow: 0 0 60px rgba(139, 92, 246, 0.25), inset 0 0 30px rgba(139, 92, 246, 0.15); }
        }

        .audio-gate-logo-icon {
          color: rgba(167, 139, 250, 0.9);
        }

        /* Typography */
        .audio-gate-title {
          font-size: 2.25rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #f5f5f5;
          margin: 0 0 0.25rem;
          background: linear-gradient(135deg, #e2e8f0, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .audio-gate-subtitle {
          font-size: 0.75rem;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(148, 163, 184, 0.7);
          margin: 0 0 2.5rem;
        }

        /* Features list */
        .audio-gate-features {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 2rem;
          width: 100%;
        }

        .audio-gate-feature {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.625rem 1rem;
          border-radius: 0.75rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: rgba(203, 213, 225, 0.8);
          font-size: 0.8125rem;
        }

        .audio-gate-feature svg {
          color: rgba(139, 92, 246, 0.7);
          flex-shrink: 0;
        }

        /* CTA Button */
        .audio-gate-btn {
          width: 100%;
          padding: 0.875rem 1.5rem;
          border-radius: 1rem;
          border: none;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          letter-spacing: 0.04em;
          font-family: inherit;
        }

        .audio-gate-btn-start {
          background: linear-gradient(135deg, #7c3aed, #06b6d4);
          color: white;
          box-shadow: 0 4px 24px rgba(124, 58, 237, 0.3);
        }

        .audio-gate-btn-start:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(124, 58, 237, 0.4);
        }

        .audio-gate-btn-start:active:not(:disabled) {
          transform: translateY(0);
        }

        .audio-gate-btn-start:disabled {
          opacity: 0.7;
          cursor: wait;
        }

        .audio-gate-btn-retry {
          background: rgba(255, 255, 255, 0.08);
          color: #f5f5f5;
          border: 1px solid rgba(255, 255, 255, 0.12);
          margin-top: 1rem;
        }

        .audio-gate-btn-retry:hover {
          background: rgba(255, 255, 255, 0.12);
        }

        .audio-gate-btn-label,
        .audio-gate-btn-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        /* Spinner */
        .audio-gate-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: audio-gate-spin 0.7s linear infinite;
        }

        @keyframes audio-gate-spin {
          to { transform: rotate(360deg); }
        }

        /* Note */
        .audio-gate-note {
          margin-top: 1.25rem;
          font-size: 0.6875rem;
          color: rgba(148, 163, 184, 0.5);
          line-height: 1.5;
        }

        /* Error state */
        .audio-gate-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 1.25rem;
          border-radius: 1rem;
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.15);
          width: 100%;
        }

        .audio-gate-error-icon {
          color: rgba(248, 113, 113, 0.9);
        }

        .audio-gate-error-text {
          color: rgba(252, 165, 165, 0.9);
          font-size: 0.8125rem;
          margin: 0;
          line-height: 1.5;
        }

        .audio-gate-error-hint {
          color: rgba(148, 163, 184, 0.6);
          font-size: 0.75rem;
          margin: 0;
          line-height: 1.5;
        }

        /* Responsive */
        @media (max-width: 480px) {
          .audio-gate-content {
            padding: 1.5rem;
          }
          .audio-gate-title {
            font-size: 1.75rem;
          }
          .audio-gate-logo-ring {
            width: 64px;
            height: 64px;
          }
          .audio-gate-logo-icon {
            width: 24px;
            height: 24px;
          }
        }
      `}</style>
    </div>
  );
};

export default AudioPermissionGate;
