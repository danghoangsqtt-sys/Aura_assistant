import React, { useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { X, Trash2, MessageSquare, Clock, User, Sparkles } from 'lucide-react';

interface ChatHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: ChatMessage[];
  onClear: () => void;
}

const ChatHistoryModal: React.FC<ChatHistoryModalProps> = ({ isOpen, onClose, history, onClear }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, history]);

  if (!isOpen) return null;

  const formatTime = (timestamp: number) => {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col h-[700px] overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 backdrop-blur z-10">
          <div className="flex items-center gap-2">
            <Clock className="text-blue-500" size={20} />
            <h2 className="text-lg font-bold text-white">Lịch sử trò chuyện</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
              {history.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button 
                onClick={onClear}
                className="p-2 hover:bg-red-900/30 text-neutral-400 hover:text-red-400 rounded-lg transition-colors flex items-center gap-1 group"
                title="Xóa lịch sử"
              >
                <Trash2 size={18} />
                <span className="text-xs font-medium hidden group-hover:inline">Xóa hết</span>
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-neutral-950/50">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-3 opacity-60">
              <MessageSquare size={48} strokeWidth={1} />
              <p>Chưa có cuộc trò chuyện nào.</p>
            </div>
          ) : (
            history.map((msg, index) => (
              <div 
                key={index} 
                className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex max-w-[85%] flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  
                  {/* Bubble */}
                  <div 
                    className={`
                      relative px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-lg
                      ${msg.role === 'user' 
                        ? 'bg-gradient-to-br from-blue-600 to-purple-700 text-white rounded-tr-sm' 
                        : 'bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-tl-sm'
                      }
                    `}
                  >
                    {msg.text}
                  </div>

                  {/* Meta info */}
                  <div className="flex items-center gap-1.5 mt-1.5 px-1">
                    {msg.role === 'user' ? (
                       <User size={10} className="text-neutral-500" />
                    ) : (
                       <Sparkles size={10} className="text-purple-400" />
                    )}
                    <span className="text-[10px] text-neutral-500 font-medium">
                      {msg.role === 'user' ? 'Bạn' : 'Aura'} • {formatTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};

export default ChatHistoryModal;

