import React, { useEffect } from 'react';
import { AlertCircle, X, ChevronRight } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
  onClick?: () => void; // Optional click handler
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, onClose, onClick, duration = 5000 }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div 
        onClick={onClick}
        className={`
          flex items-center gap-3 bg-neutral-900/90 backdrop-blur-md border border-red-900/50 text-red-200 px-6 py-3 rounded-full shadow-2xl shadow-red-900/20
          ${onClick ? 'cursor-pointer hover:bg-neutral-800 transition-colors pr-4' : ''}
        `}
      >
        <AlertCircle size={18} className="text-red-500 shrink-0" />
        <span className="text-sm font-medium">{message}</span>
        
        {onClick && <ChevronRight size={16} className="text-red-400 opacity-70" />}

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-2 p-1 hover:bg-red-500/20 rounded-full transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default Toast;
