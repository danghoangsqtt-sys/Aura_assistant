/**
 * MeetingNotesPanel.tsx — Panel ghi chú cuộc họp/bài giảng trực tiếp
 *
 * Bao gồm 2 tab:
 * - "Đang ghi" — hiển thị ghi chú live, bộ lọc, tìm kiếm, xóa từng note
 * - "Lịch sử" — hiển thị các phiên đã lưu (delegate sang MeetingHistoryPanel)
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { MeetingNoteEntry, MeetingNoteType } from '../types';
import {
  FileText, StopCircle, CheckCircle, MessageSquare, HelpCircle,
  User, Activity, Trash2, Clock, FileDown, X, Pin
} from 'lucide-react';
import MeetingNoteFilters from './MeetingNoteFilters';
import MeetingHistoryPanel from './MeetingHistoryPanel';
import { meetingHistoryService } from '../services/meetingHistoryService';

interface MeetingNotesPanelProps {
  notes: MeetingNoteEntry[];
  isLive: boolean;
  onEndMeeting: () => void;
  onSummary: () => void;
  onClear?: () => void;
  onRemoveNote?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToast?: (msg: string) => void;
  /** Trigger +1 khi vừa lưu xong phiên mới */
  historyRefreshKey?: number;
}

const NOTE_TYPE_CONFIG = {
  speech: { icon: <MessageSquare size={14} />, color: 'text-neutral-300', bg: 'bg-neutral-500/10' },
  decision: { icon: <CheckCircle size={14} />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  action: { icon: <Activity size={14} />, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  question: { icon: <HelpCircle size={14} />, color: 'text-purple-400', bg: 'bg-purple-500/10' },
};

const getSpeakerColor = (speaker: string) => {
  const hash = speaker.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 65%)`;
};

type TabKey = 'live' | 'history';

const MeetingNotesPanel: React.FC<MeetingNotesPanelProps> = ({
  notes,
  isLive,
  onEndMeeting,
  onSummary,
  onClear,
  onRemoveNote,
  onTogglePin,
  onToast,
  historyRefreshKey = 0,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('live');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<MeetingNoteType | 'all'>('all');

  // Auto-scroll to bottom when new notes arrive
  useEffect(() => {
    if (activeTab === 'live') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [notes, activeTab]);

  // Filter & search, pinned notes first
  const filteredNotes = useMemo(() => {
    let result = notes;

    if (activeFilter !== 'all') {
      result = result.filter(n => n.type === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n =>
        n.content.toLowerCase().includes(q) ||
        n.speaker.toLowerCase().includes(q)
      );
    }

    // Sort: pinned notes first, then by timestamp
    return [...result].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0; // keep original order within each group
    });
  }, [notes, activeFilter, searchQuery]);

  // Count by type for filter chips
  const counts = useMemo(() => {
    const c: Record<MeetingNoteType | 'all', number> = {
      all: notes.length,
      speech: 0,
      decision: 0,
      action: 0,
      question: 0,
    };
    for (const note of notes) {
      c[note.type] = (c[note.type] || 0) + 1;
    }
    return c;
  }, [notes]);

  const handleExportCurrent = () => {
    if (notes.length === 0) return;
    const md = meetingHistoryService.exportCurrentToMarkdown(notes);
    navigator.clipboard.writeText(md).then(() => {
      onToast?.('📋 Đã sao chép ghi chú vào clipboard!');
    }).catch(() => {
      onToast?.('❌ Không thể sao chép.');
    });
  };

  // ── History count badge ─────────────────────────────────
  const historyCount = useMemo(() => {
    return meetingHistoryService.getHistory().length;
  }, [historyRefreshKey]);

  return (
    <div className="w-80 h-full max-h-full flex flex-col bg-black/40 backdrop-blur-xl border-l border-white/10 shadow-2xl transition-all duration-300 pointer-events-auto shrink-0">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <FileText size={16} />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm tracking-wide">Ghi Chú Trực Tiếp</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isLive ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] text-red-400 font-medium uppercase tracking-widest">Đang Lắng Nghe</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                  <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-widest">Đã Dừng</span>
                </>
              )}
            </div>
          </div>
        </div>
        {/* Header actions */}
        <div className="flex items-center gap-1.5">
          {activeTab === 'live' && notes.length > 0 && (
            <>
              <button
                onClick={handleExportCurrent}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-emerald-500/15 border border-white/10 hover:border-emerald-500/30 flex items-center justify-center text-white/40 hover:text-emerald-400 transition-all active:scale-90"
                title="Xuất ghi chú hiện tại"
              >
                <FileDown size={13} />
              </button>
              {onClear && (
                <button
                  onClick={onClear}
                  className="w-7 h-7 rounded-full bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 flex items-center justify-center text-white/40 hover:text-red-400 transition-all active:scale-90"
                  title="Xóa ghi chú"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 ${
            activeTab === 'live'
              ? 'text-emerald-400 border-emerald-400 bg-emerald-500/5'
              : 'text-white/40 border-transparent hover:text-white/60 hover:bg-white/5'
          }`}
        >
          Đang Ghi ({notes.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-1.5 ${
            activeTab === 'history'
              ? 'text-blue-400 border-blue-400 bg-blue-500/5'
              : 'text-white/40 border-transparent hover:text-white/60 hover:bg-white/5'
          }`}
        >
          <Clock size={11} />
          Lịch Sử
          {historyCount > 0 && (
            <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-bold">
              {historyCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'live' ? (
        <>
          {/* Filters (only show when there are notes) */}
          {notes.length > 3 && (
            <MeetingNoteFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              counts={counts}
            />
          )}

          {/* Notes Container */}
          <div className="flex-1 overflow-y-auto px-4 py-5 custom-scrollbar scroll-smooth">
            {filteredNotes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-50 space-y-3">
                <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white/40">
                  <FileText size={20} />
                </div>
                <p className="text-xs text-white/50 text-center max-w-[200px] leading-relaxed">
                  {notes.length > 0 && filteredNotes.length === 0
                    ? 'Không tìm thấy ghi chú phù hợp.'
                    : 'Aura đang lắng nghe. Cuộc họp sẽ tự động được ghi chú tại đây...'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredNotes.map((note) => {
                  const config = NOTE_TYPE_CONFIG[note.type] || NOTE_TYPE_CONFIG.speech;
                  const timeStr = new Date(note.timestamp).toLocaleTimeString('vi-VN', {
                    hour: '2-digit', minute: '2-digit'
                  });
                  
                  return (
                    <div key={note.id} className="group flex flex-col gap-1.5 animate-in slide-in-from-right-4 fade-in duration-300">
                      {/* Meta */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="p-0.5 rounded-full bg-white/5">
                            <User size={12} strokeWidth={2.5} style={{ color: getSpeakerColor(note.speaker) }} />
                          </div>
                          <span className="text-[11px] font-bold tracking-wide shadow-sm" style={{ color: getSpeakerColor(note.speaker) }}>
                            {note.speaker}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-white/30 font-mono">{timeStr}</span>
                          {/* Pin note button */}
                          {onTogglePin && (
                            <button
                              onClick={() => onTogglePin(note.id)}
                              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                note.isPinned
                                  ? 'text-amber-400 bg-amber-500/10'
                                  : 'text-white/0 group-hover:text-white/30 hover:!text-amber-400 hover:bg-amber-500/10'
                              }`}
                              title={note.isPinned ? 'Bỏ ghim' : 'Ghim ghi chú'}
                            >
                              <Pin size={10} />
                            </button>
                          )}
                          {/* Delete note button */}
                          {onRemoveNote && (
                            <button
                              onClick={() => onRemoveNote(note.id)}
                              className="w-5 h-5 rounded-full flex items-center justify-center text-white/0 group-hover:text-white/30 hover:!text-red-400 hover:bg-red-500/10 transition-all"
                              title="Xóa ghi chú này"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Content Bubble */}
                      <div className={`p-3 rounded-2xl rounded-tl-sm border ${note.isPinned ? 'border-amber-500/20 ring-1 ring-amber-500/10' : 'border-white/5'} ${config.bg} shadow-sm backdrop-blur-sm relative overflow-hidden transition-colors`}>
                        {note.isPinned && (
                          <div className="absolute top-0 right-0 w-0 h-0 border-t-[16px] border-t-amber-500/30 border-l-[16px] border-l-transparent" />
                        )}
                        <div className="flex gap-2">
                          <div className={`shrink-0 mt-0.5 ${config.color} opacity-80`}>
                            {config.icon}
                          </div>
                          <p className="text-xs text-neutral-200 leading-relaxed break-words">
                            {note.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} className="h-2" />
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="p-4 border-t border-white/10 bg-black/40 shrink-0">
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={onSummary}
                className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white/80 transition-all active:scale-95"
              >
                <Activity size={14} />
                <span className="text-xs font-semibold tracking-wide">Tóm Tắt</span>
              </button>
              
              <button 
                onClick={onEndMeeting}
                className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 transition-all active:scale-95 group"
              >
                <StopCircle size={14} className="group-hover:animate-pulse" />
                <span className="text-xs font-semibold tracking-wide">Kết Thúc</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        /* History Tab */
        <MeetingHistoryPanel
          onToast={onToast}
          refreshKey={historyRefreshKey}
        />
      )}
    </div>
  );
};

export default MeetingNotesPanel;
