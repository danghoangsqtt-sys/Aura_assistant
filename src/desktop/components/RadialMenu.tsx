import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Mic, MicOff, Volume2, VolumeX, Radio, Power, Eye, EyeOff, Camera, CameraOff, FileText, PresentationIcon } from 'lucide-react';

export default function RadialMenu({ 
  isOpen, onClose, gemini, apiKeyReady, 
  isMicMuted, isSpeakerMuted, isLiveMode, isScreenVisionOn, isCameraVisionOn,
  isMeetingMode, onToggleMeetingMode,
  isPresentationMode, onTogglePresentationMode,
  onToggleMic, onToggleSpeaker, onToggleLive, onOpenSettings, onConnect, onToggleVision, onToggleCameraVision,
  avatarScale = 1
}: any) {
  
  const items = [
    { icon: <Settings size={20}/>, label: "Cài đặt", onClick: onOpenSettings, active: false },
    { icon: isMicMuted ? <MicOff size={20}/> : <Mic size={20}/>, label: "Mic", onClick: onToggleMic, active: !isMicMuted, color: !isMicMuted ? "text-green-400" : "text-red-400" },
    { icon: isSpeakerMuted ? <VolumeX size={20}/> : <Volume2 size={20}/>, label: "Loa", onClick: onToggleSpeaker, active: !isSpeakerMuted, color: !isSpeakerMuted ? "text-blue-400" : "text-red-400" },
    { icon: isScreenVisionOn ? <Eye size={20}/> : <EyeOff size={20}/>, label: "Màn hình", onClick: onToggleVision, active: isScreenVisionOn, color: isScreenVisionOn ? "text-cyan-400 animate-pulse" : "text-neutral-400" },
    { icon: isCameraVisionOn ? <Camera size={20}/> : <CameraOff size={20}/>, label: "Camera", onClick: onToggleCameraVision, active: isCameraVisionOn, color: isCameraVisionOn ? "text-amber-400 animate-pulse" : "text-neutral-400" },
    { icon: <FileText size={20}/>, label: "Meeting", onClick: onToggleMeetingMode, active: isMeetingMode, color: isMeetingMode ? "text-emerald-400 animate-pulse" : "text-neutral-400" },
    // [WIP — DISABLED] Presentation Mode: temporarily paused pending screen capture fix
    // Known bugs: (1) voice trigger conflicts with meeting mode, (2) desktopCapturer can't capture
    // PowerPoint Slideshow (hardware overlay). Re-enable when both are resolved.
    // { icon: <PresentationIcon size={20}/>, label: isPresentationMode ? "Dừng TT" : "Thuyết trình", onClick: onTogglePresentationMode, active: isPresentationMode, color: isPresentationMode ? "text-violet-400 animate-pulse" : "text-neutral-400" },

    { icon: <Radio size={20}/>, label: "Live Chat", onClick: onToggleLive, active: isLiveMode, color: isLiveMode ? "text-red-400 animate-pulse" : "text-neutral-400" },
    { icon: <Power size={20}/>, label: gemini.active ? "Dừng" : "Bắt đầu", onClick: onConnect, active: gemini.active, color: gemini.active ? "text-purple-400" : "text-neutral-400" },
  ];

  const radius = 110 * (avatarScale || 1); 

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-auto" 
            onClick={onClose} 
            /* Fix BUG-06 & UX: Xóa nền đen để Radial Menu nổi trực tiếp trên Avatar (bám theo Avatar) */
            style={{ backgroundColor: 'transparent' }}
        >
          <div className="relative flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-4 h-4 bg-white/20 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)] animate-pulse" />

            {items.map((item, index) => {
                const angle = (index / items.length) * Math.PI * 2 - Math.PI / 2; 
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                return (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                    animate={{ opacity: 1, x, y, scale: 1 }}
                    exit={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                    transition={{ type: 'tween', duration: 0.2, delay: index * 0.03, ease: 'easeOut' }}
                    style={{ willChange: 'transform, opacity' }}
                    onClick={(e) => { e.stopPropagation(); item.onClick(); onClose(); }}
                    className={`group absolute w-14 h-14 rounded-full flex items-center justify-center border shadow-2xl transition-transform hover:scale-110 
                      ${item.active ? 'bg-white/10 border-white/30' : 'bg-black/60 border-white/10'} ${item.color || 'text-white'}
                    `}
                  >
                    {item.icon}
                    <span className="absolute -bottom-7 text-[10px] tracking-wider whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-neutral-900/80 backdrop-blur-md px-2 py-1 rounded-md border border-white/10 shadow-lg pointer-events-none z-10 text-white font-medium">
                      {item.label}
                    </span>
                  </motion.button>
                );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
