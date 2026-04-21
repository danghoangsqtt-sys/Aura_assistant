/**
 * MeetingAnalytics.tsx — Mini-dashboard thống kê hoạt động meeting
 */

import React from 'react';
import { MeetingAnalytics as AnalyticsData } from '../services/meetingHistoryService';
import { MeetingSessionTag } from '../types';
import { BarChart3, Clock, FileText, CheckCircle, Activity, HelpCircle, TrendingUp } from 'lucide-react';

interface MeetingAnalyticsProps {
  analytics: AnalyticsData;
  onClose: () => void;
}

const TAG_LABELS: Record<MeetingSessionTag, { label: string; emoji: string; color: string }> = {
  meeting: { label: 'Cuộc họp', emoji: '📋', color: 'bg-blue-500/15 text-blue-400' },
  lecture: { label: 'Bài giảng', emoji: '📚', color: 'bg-emerald-500/15 text-emerald-400' },
  brainstorm: { label: 'Brainstorm', emoji: '💡', color: 'bg-amber-500/15 text-amber-400' },
  interview: { label: 'Phỏng vấn', emoji: '🎤', color: 'bg-purple-500/15 text-purple-400' },
  other: { label: 'Khác', emoji: '📝', color: 'bg-white/10 text-white/60' },
};

const MeetingAnalyticsPanel: React.FC<MeetingAnalyticsProps> = ({ analytics, onClose }) => {
  const { totalSessions, totalNotes, totalDurationMinutes, totalDecisions,
    totalActions, totalQuestions, avgNotesPerSession, avgDurationMinutes,
    tagDistribution } = analytics;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20 shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-blue-400" />
          <span className="text-xs font-bold text-white">Thống kê Meeting</span>
        </div>
        <button
          onClick={onClose}
          className="text-[10px] text-white/40 hover:text-white/70 transition-colors px-2 py-0.5 rounded bg-white/5 hover:bg-white/10"
        >
          Đóng
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
        {totalSessions === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40 space-y-2">
            <BarChart3 size={28} className="text-white/30" />
            <p className="text-[11px] text-white/40 text-center">Chưa có dữ liệu thống kê.</p>
          </div>
        ) : (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                icon={<FileText size={14} />}
                label="Tổng phiên"
                value={totalSessions.toString()}
                color="text-blue-400"
              />
              <StatCard
                icon={<Clock size={14} />}
                label="Tổng thời gian"
                value={totalDurationMinutes > 60 ? `${Math.round(totalDurationMinutes / 60)}h` : `${totalDurationMinutes}m`}
                color="text-purple-400"
              />
              <StatCard
                icon={<TrendingUp size={14} />}
                label="TB ghi chú/phiên"
                value={avgNotesPerSession.toString()}
                color="text-emerald-400"
              />
              <StatCard
                icon={<Clock size={14} />}
                label="TB thời lượng"
                value={`${avgDurationMinutes}m`}
                color="text-amber-400"
              />
            </div>

            {/* Important Stats */}
            <div className="space-y-1.5">
              <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Tổng quan nội dung</h4>
              <div className="space-y-1">
                <StatRow icon={<CheckCircle size={11} />} label="Quyết định" value={totalDecisions} color="text-emerald-400" total={totalNotes} />
                <StatRow icon={<Activity size={11} />} label="Nhiệm vụ" value={totalActions} color="text-amber-400" total={totalNotes} />
                <StatRow icon={<HelpCircle size={11} />} label="Câu hỏi" value={totalQuestions} color="text-purple-400" total={totalNotes} />
              </div>
            </div>

            {/* Tag Distribution */}
            <div className="space-y-1.5">
              <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Phân loại</h4>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(tagDistribution)
                  .filter(([, count]) => count > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([tag, count]) => {
                    const config = TAG_LABELS[tag as MeetingSessionTag];
                    return (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold ${config.color}`}
                      >
                        <span>{config.emoji}</span>
                        <span>{config.label}</span>
                        <span className="opacity-60">({count})</span>
                      </span>
                    );
                  })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Stat Card ─────────────────────────────────────────
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({
  icon, label, value, color,
}) => (
  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
    <div className={`${color} mb-1 opacity-80`}>{icon}</div>
    <div className="text-lg font-bold text-white leading-none">{value}</div>
    <div className="text-[9px] text-white/40 mt-0.5">{label}</div>
  </div>
);

// ── Stat Row with bar ────────────────────────────────
const StatRow: React.FC<{ icon: React.ReactNode; label: string; value: number; color: string; total: number }> = ({
  icon, label, value, color, total,
}) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 group">
      <span className={`${color} opacity-70`}>{icon}</span>
      <span className="text-[10px] text-white/60 w-16">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color.replace('text-', 'bg-').replace('400', '500/40')}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="text-[10px] text-white/40 font-mono w-8 text-right">{value}</span>
    </div>
  );
};

export default MeetingAnalyticsPanel;
