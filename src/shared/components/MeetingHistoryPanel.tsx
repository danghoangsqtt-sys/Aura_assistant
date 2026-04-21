/**
 * MeetingHistoryPanel.tsx — Hiển thị lịch sử các phiên ghi chú đã lưu
 *
 * Tính năng:
 * - Danh sách phiên đã lưu (với tag, thống kê)
 * - Xem chi tiết phiên cũ
 * - Tìm kiếm xuyên phiên (cross-session search)
 * - Đổi tag / xóa phiên
 * - Xuất Markdown (3 template)
 * - Analytics dashboard
 */

import React, { useState, useMemo } from 'react';
import {
  SavedMeetingSession, meetingHistoryService, ExportTemplate, CrossSearchResult,
} from '../services/meetingHistoryService';
import { MeetingSessionTag } from '../types';
import {
  Clock, Trash2, FileDown, ChevronRight, ChevronLeft, Search, X,
  MessageSquare, CheckCircle, Activity, HelpCircle, AlertTriangle,
  BarChart3, Tag, Pin
} from 'lucide-react';
import MeetingAnalyticsPanel from './MeetingAnalytics';

interface MeetingHistoryPanelProps {
  onToast?: (msg: string) => void;
  refreshKey?: number;
}

const TAG_CONFIG: Record<MeetingSessionTag, { label: string; emoji: string; color: string; bgColor: string }> = {
  meeting: { label: 'Cuộc họp', emoji: '📋', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  lecture: { label: 'Bài giảng', emoji: '📚', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  brainstorm: { label: 'Brainstorm', emoji: '💡', color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  interview: { label: 'Phỏng vấn', emoji: '🎤', color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  other: { label: 'Khác', emoji: '📝', color: 'text-white/50', bgColor: 'bg-white/5' },
};

const TYPE_ICONS = {
  speech: <MessageSquare size={10} />,
  decision: <CheckCircle size={10} />,
  action: <Activity size={10} />,
  question: <HelpCircle size={10} />,
};

const TEMPLATE_OPTIONS: { key: ExportTemplate; label: string }[] = [
  { key: 'full', label: 'Đầy đủ' },
  { key: 'lecture', label: 'Bài giảng' },
  { key: 'compact', label: 'Tóm tắt' },
];

type ViewMode = 'list' | 'detail' | 'search' | 'analytics';

const MeetingHistoryPanel: React.FC<MeetingHistoryPanelProps> = ({ onToast, refreshKey }) => {
  const [history, setHistory] = React.useState<SavedMeetingSession[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<MeetingSessionTag | 'all'>('all');
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [exportTemplate, setExportTemplate] = useState<ExportTemplate>('full');

  React.useEffect(() => {
    setHistory(meetingHistoryService.getHistory());
  }, [refreshKey]);

  const refresh = () => setHistory(meetingHistoryService.getHistory());

  // Cross-session search results
  const searchResults = useMemo(() => {
    if (viewMode !== 'search' || !searchQuery.trim()) return [];
    return meetingHistoryService.searchAcrossSessions(searchQuery);
  }, [searchQuery, viewMode]);

  // Filtered history by tag
  const filteredHistory = useMemo(() => {
    if (tagFilter === 'all') return history;
    return history.filter(s => s.tag === tagFilter);
  }, [history, tagFilter]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    meetingHistoryService.deleteSession(id);
    refresh();
    if (selectedId === id) { setSelectedId(null); setViewMode('list'); }
    onToast?.('🗑️ Đã xóa phiên ghi chú.');
  };

  const handleExport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const md = meetingHistoryService.exportToMarkdown(id, exportTemplate);
    if (!md) return;
    navigator.clipboard.writeText(md).then(() => {
      onToast?.('📋 Đã sao chép báo cáo vào clipboard!');
    }).catch(() => {
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `meeting_notes_${id}.md`; a.click();
      URL.revokeObjectURL(url);
      onToast?.('📥 Đã tải xuống báo cáo.');
    });
  };

  const handleClearAll = () => {
    if (!confirmClearAll) { setConfirmClearAll(true); setTimeout(() => setConfirmClearAll(false), 3000); return; }
    meetingHistoryService.clearAll();
    refresh();
    setSelectedId(null); setViewMode('list'); setConfirmClearAll(false);
    onToast?.('🗑️ Đã xóa toàn bộ lịch sử ghi chú.');
  };

  const handleChangeTag = (sessionId: string, newTag: MeetingSessionTag) => {
    meetingHistoryService.updateSessionTag(sessionId, newTag);
    refresh();
    setEditingTag(null);
    onToast?.(`🏷️ Đã đổi nhãn thành "${TAG_CONFIG[newTag].label}"`);
  };

  // ── DETAIL VIEW ─────────────────────────────────────────
  const selectedSession = selectedId ? history.find(s => s.id === selectedId) : null;
  if (viewMode === 'detail' && selectedSession) {
    const tagConf = TAG_CONFIG[selectedSession.tag || 'meeting'];
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-black/20 shrink-0">
          <button onClick={() => { setSelectedId(null); setViewMode('list'); }}
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all">
            <ChevronLeft size={14} />
          </button>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-white truncate">{selectedSession.title}</h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${tagConf.bgColor} ${tagConf.color}`}>
                {tagConf.emoji} {tagConf.label}
              </span>
              <span className="text-[10px] text-white/30">{selectedSession.noteCount} ghi chú</span>
            </div>
          </div>
          {/* Export template selector */}
          <div className="flex items-center gap-1">
            <select
              value={exportTemplate}
              onChange={e => setExportTemplate(e.target.value as ExportTemplate)}
              className="bg-white/5 border border-white/10 rounded-lg text-[9px] text-white/60 px-1 py-0.5 focus:outline-none"
            >
              {TEMPLATE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <button onClick={(e) => handleExport(selectedSession.id, e)}
              className="w-7 h-7 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 transition-all"
              title="Xuất Markdown">
              <FileDown size={12} />
            </button>
          </div>
        </div>
        {/* Notes list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 custom-scrollbar space-y-2.5">
          {selectedSession.notes.map((note) => {
            const timeStr = new Date(note.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={note.id} className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {note.isPinned && <Pin size={9} className="text-amber-400" />}
                    <span className="font-bold text-white/70">{note.speaker}</span>
                  </div>
                  <span className="text-[10px] text-white/30 font-mono">{timeStr}</span>
                </div>
                <div className="px-2.5 py-2 rounded-xl bg-white/5 border border-white/5 text-neutral-300 leading-relaxed">
                  {note.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── ANALYTICS VIEW ──────────────────────────────────────
  if (viewMode === 'analytics') {
    const analytics = meetingHistoryService.getAnalytics();
    return <MeetingAnalyticsPanel analytics={analytics} onClose={() => setViewMode('list')} />;
  }

  // ── SEARCH VIEW ─────────────────────────────────────────
  if (viewMode === 'search') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-3 border-b border-white/10 bg-black/20 shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <button onClick={() => { setViewMode('list'); setSearchQuery(''); }}
              className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all">
              <ChevronLeft size={14} />
            </button>
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm trong tất cả phiên..." autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-7 pr-7 text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          <span className="text-[10px] text-white/30">
            {searchResults.length > 0 ? `${searchResults.length} kết quả` : searchQuery ? 'Không tìm thấy' : 'Gõ từ khóa để tìm kiếm'}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
          {searchResults.map((result, i) => {
            const dateStr = new Date(result.sessionDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            const tagConf = TAG_CONFIG[result.sessionTag || 'meeting'];
            return (
              <div key={`${result.sessionId}_${result.note.id}_${i}`}
                onClick={() => { setSelectedId(result.sessionId); setViewMode('detail'); }}
                className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 cursor-pointer transition-all">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[8px] px-1 py-0.5 rounded ${tagConf.bgColor} ${tagConf.color} font-semibold`}>
                    {tagConf.emoji}
                  </span>
                  <span className="text-[10px] text-white/50 truncate flex-1">{result.sessionTitle}</span>
                  <span className="text-[9px] text-white/25">{dateStr}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-white/60">{result.note.speaker}:</span>
                  <span className="text-[10px] text-white/40 truncate">{result.note.content}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ───────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Top actions: Search + Analytics */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5 bg-black/10 shrink-0">
        <button onClick={() => setViewMode('search')}
          className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/60 transition-all text-[10px]">
          <Search size={11} /> <span>Tìm xuyên phiên...</span>
        </button>
        <button onClick={() => setViewMode('analytics')}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-blue-500/10 border border-white/10 flex items-center justify-center text-white/40 hover:text-blue-400 transition-all"
          title="Thống kê">
          <BarChart3 size={13} />
        </button>
      </div>

      {/* Tag filter chips */}
      {history.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5 flex-wrap shrink-0">
          <button onClick={() => setTagFilter('all')}
            className={`px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all border ${
              tagFilter === 'all' ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-transparent text-white/40 hover:text-white/60'
            }`}>Tất cả</button>
          {(Object.entries(TAG_CONFIG) as [MeetingSessionTag, typeof TAG_CONFIG[MeetingSessionTag]][])
            .filter(([tag]) => history.some(s => s.tag === tag))
            .map(([tag, conf]) => (
              <button key={tag} onClick={() => setTagFilter(tag)}
                className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all border ${
                  tagFilter === tag ? `${conf.bgColor} border-current ${conf.color}` : 'bg-transparent border-transparent text-white/40 hover:text-white/60'
                }`}>
                <span>{conf.emoji}</span> {conf.label}
              </button>
            ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <span className="text-[10px] font-bold text-white/40">{filteredHistory.length} phiên</span>
        {history.length > 0 && (
          <button onClick={handleClearAll}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
              confirmClearAll ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                : 'bg-white/5 text-white/40 hover:text-red-400 hover:bg-red-500/10 border border-transparent'
            }`}>
            {confirmClearAll ? <><AlertTriangle size={10} /><span>Xác nhận?</span></> : <><Trash2 size={10} /><span>Xóa hết</span></>}
          </button>
        )}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40 space-y-2 px-4">
            <Clock size={24} className="text-white/30" />
            <p className="text-[11px] text-white/40 text-center leading-relaxed">
              {history.length > 0 ? 'Không có phiên nào phù hợp với bộ lọc.' : 'Chưa có phiên ghi chú nào được lưu.'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {filteredHistory.map((session) => {
              const dateStr = new Date(session.startedAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
              const timeStr = new Date(session.startedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
              const duration = Math.round((session.endedAt - session.startedAt) / 60000);
              const tagConf = TAG_CONFIG[session.tag || 'meeting'];

              return (
                <div key={session.id}
                  onClick={() => { setSelectedId(session.id); setViewMode('detail'); }}
                  className="group p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 cursor-pointer transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Tag badge + title */}
                      <div className="flex items-center gap-1.5 mb-1">
                        {editingTag === session.id ? (
                          <div className="flex items-center gap-0.5 flex-wrap">
                            {(Object.entries(TAG_CONFIG) as [MeetingSessionTag, typeof TAG_CONFIG[MeetingSessionTag]][]).map(([tag, conf]) => (
                              <button key={tag} onClick={(e) => { e.stopPropagation(); handleChangeTag(session.id, tag); }}
                                className={`px-1.5 py-0.5 rounded text-[8px] font-semibold ${conf.bgColor} ${conf.color} hover:opacity-80 transition-opacity`}>
                                {conf.emoji}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); setEditingTag(session.id); }}
                            className={`inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-full font-semibold ${tagConf.bgColor} ${tagConf.color} hover:opacity-80 transition-opacity`}
                            title="Đổi nhãn">
                            <span>{tagConf.emoji}</span>
                          </button>
                        )}
                      </div>
                      <h4 className="text-[11px] font-bold text-white/80 truncate leading-tight">{session.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-white/30">{dateStr} {timeStr}</span>
                        <span className="text-[10px] text-white/20">•</span>
                        <span className="text-[10px] text-white/30">{duration > 0 ? `${duration}m` : '<1m'}</span>
                      </div>
                      {/* Stats chips */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {session.stats.decisionCount > 0 && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-semibold">
                            {TYPE_ICONS.decision} {session.stats.decisionCount}
                          </span>
                        )}
                        {session.stats.actionCount > 0 && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[9px] font-semibold">
                            {TYPE_ICONS.action} {session.stats.actionCount}
                          </span>
                        )}
                        {session.stats.questionCount > 0 && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-[9px] font-semibold">
                            {TYPE_ICONS.question} {session.stats.questionCount}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/5 text-white/40 text-[9px] font-semibold">
                          {TYPE_ICONS.speech} {session.stats.speechCount}
                        </span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <select value={exportTemplate}
                        onChange={e => { e.stopPropagation(); setExportTemplate(e.target.value as ExportTemplate); }}
                        onClick={e => e.stopPropagation()}
                        className="bg-white/5 border border-white/10 rounded text-[8px] text-white/40 px-0.5 py-0.5 focus:outline-none w-14">
                        {TEMPLATE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                      <button onClick={(e) => handleExport(session.id, e)}
                        className="w-6 h-6 rounded-md bg-white/5 hover:bg-emerald-500/15 flex items-center justify-center text-white/30 hover:text-emerald-400 transition-all"
                        title="Xuất">
                        <FileDown size={11} />
                      </button>
                      <button onClick={(e) => handleDelete(session.id, e)}
                        className="w-6 h-6 rounded-md bg-white/5 hover:bg-red-500/15 flex items-center justify-center text-white/30 hover:text-red-400 transition-all"
                        title="Xóa">
                        <Trash2 size={11} />
                      </button>
                      <ChevronRight size={12} className="text-white/20 ml-0.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingHistoryPanel;
