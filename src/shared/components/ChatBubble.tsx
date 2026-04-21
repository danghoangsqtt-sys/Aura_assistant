import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ChatBubble({ messages, liveTranscript, isSpeaking }: any) {
  const [displayMessage, setDisplayMessage] = useState<string | null>(null);

  useEffect(() => {
    if (liveTranscript && liveTranscript.role === 'model') {
      setDisplayMessage(liveTranscript.text);
    } else if (messages && messages.length > 0) {
      const lastMsg = [...messages].reverse().find((m: any) => m.role === 'model');
      if (lastMsg) {
        setDisplayMessage(lastMsg.text);
      }
    } else {
      setDisplayMessage(null);
    }
  }, [messages, liveTranscript]);

  // Hide message after 5 seconds of silence
  useEffect(() => {
    if (!isSpeaking && displayMessage) {
      const timer = setTimeout(() => {
         setDisplayMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isSpeaking, displayMessage]);

  if (!displayMessage) return null;

  return (
    <div className="absolute right-[5%] top-[15%] max-w-[280px] z-[90] pointer-events-none">
      <AnimatePresence>
        <motion.div
           initial={{ opacity: 0, scale: 0.8, y: 10, originX: 0, originY: 1 }}
           animate={{ opacity: 1, scale: 1, y: 0 }}
           exit={{ opacity: 0, scale: 0.8, y: -10 }}
           className="relative bg-white/95 backdrop-blur-xl border border-white/30 text-neutral-900 px-5 py-4 rounded-3xl rounded-br-sm shadow-2xl"
        >
          {/* Mũi nhọn trỏ về phía nhân vật */}
          <div className="absolute -bottom-3 right-0 w-6 h-6 bg-white/95 border-b border-r border-white/30 transform rotate-45 rounded-sm" />
          
          <p className="text-[13px] leading-relaxed font-medium relative z-10">
            {displayMessage} {isSpeaking && <span className="animate-pulse text-purple-600">...</span>}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

