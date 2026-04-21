/**
 * MeetingNoteFilters.tsx — Bộ lọc & Tìm kiếm ghi chú cuộc họp
 *
 * Component nhỏ, được render trong MeetingNotesPanel liveView.
 */

import React from 'react';
import { MeetingNoteType } from '../types';
import { Search, X, MessageSquare, CheckCircle, Activity, HelpCircle } from 'lucide-react';

interface MeetingNoteFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilter: MeetingNoteType | 'all';
  onFilterChange: (filter: MeetingNoteType | 'all') => void;
  counts: Record<MeetingNoteType | 'all', number>;
}

const FILTER_OPTIONS: { key: MeetingNoteType | 'all'; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'all', label: 'Tất cả', icon: null, color: 'text-white/60' },
  { key: 'speech', label: 'Thảo luận', icon: <MessageSquare size={10} />, color: 'text-neutral-300' },
  { key: 'decision', label: 'Quyết định', icon: <CheckCircle size={10} />, color: 'text-emerald-400' },
  { key: 'action', label: 'Nhiệm vụ', icon: <Activity size={10} />, color: 'text-amber-400' },
  { key: 'question', label: 'Câu hỏi', icon: <HelpCircle size={10} />, color: 'text-purple-400' },
];

const MeetingNoteFilters: React.FC<MeetingNoteFiltersProps> = ({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  counts,
}) => {
  return (
    <div className="px-3 py-2 border-b border-white/5 space-y-2 bg-black/10 shrink-0">
      {/* Search bar */}
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm kiếm ghi chú..."
          className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-7 pr-7 text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {FILTER_OPTIONS.map(({ key, label, icon, color }) => {
          const count = counts[key] || 0;
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all border ${
                isActive
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-transparent border-transparent text-white/40 hover:text-white/60 hover:bg-white/5'
              }`}
            >
              {icon && <span className={color}>{icon}</span>}
              <span>{label}</span>
              {count > 0 && (
                <span className="text-[8px] text-white/30 ml-0.5">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MeetingNoteFilters;
