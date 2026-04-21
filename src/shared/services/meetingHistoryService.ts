/**
 * meetingHistoryService.ts — Quản lý lịch sử các phiên ghi chú cuộc họp/bài giảng
 *
 * Lưu trữ vào localStorage, cung cấp các thao tác:
 * - Lưu phiên meeting khi kết thúc
 * - Lấy danh sách phiên đã lưu
 * - Xóa 1 phiên cụ thể / xóa toàn bộ
 * - Xuất phiên ra Markdown (nhiều template)
 * - Tìm kiếm xuyên phiên (cross-session search)
 * - Thống kê tổng quan (analytics)
 * - Phân loại phiên bằng tag
 */

import { MeetingNoteEntry, MeetingNoteType, MeetingSessionTag } from '../types';

const STORAGE_KEY = 'aura_meeting_history';
const MAX_SESSIONS = 50;

export type ExportTemplate = 'full' | 'lecture' | 'compact';

export interface SavedMeetingSession {
  id: string;
  title: string;
  tag: MeetingSessionTag;
  startedAt: number;
  endedAt: number;
  notes: MeetingNoteEntry[];
  noteCount: number;
  stats: {
    speechCount: number;
    decisionCount: number;
    actionCount: number;
    questionCount: number;
  };
}

export interface MeetingAnalytics {
  totalSessions: number;
  totalNotes: number;
  totalDurationMinutes: number;
  totalDecisions: number;
  totalActions: number;
  totalQuestions: number;
  avgNotesPerSession: number;
  avgDurationMinutes: number;
  tagDistribution: Record<MeetingSessionTag, number>;
  recentActivity: { date: string; count: number }[];
}

export interface CrossSearchResult {
  sessionId: string;
  sessionTitle: string;
  sessionTag: MeetingSessionTag;
  sessionDate: number;
  note: MeetingNoteEntry;
  matchScore: number;
}

class MeetingHistoryService {
  /**
   * Lưu 1 phiên meeting vào lịch sử
   */
  saveSession(notes: MeetingNoteEntry[], title?: string, tag?: MeetingSessionTag): SavedMeetingSession | null {
    if (!notes || notes.length === 0) return null;

    const startedAt = notes[0].timestamp;
    const endedAt = notes[notes.length - 1].timestamp;
    const detectedTag = tag || this.autoDetectTag(notes);

    const session: SavedMeetingSession = {
      id: `meeting_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title || this.generateSmartTitle(notes, startedAt, detectedTag),
      tag: detectedTag,
      startedAt,
      endedAt,
      notes: [...notes],
      noteCount: notes.length,
      stats: this.calculateStats(notes),
    };

    const history = this.getHistory();
    history.unshift(session);
    if (history.length > MAX_SESSIONS) history.splice(MAX_SESSIONS);
    this.persist(history);
    return session;
  }

  /** Lấy toàn bộ lịch sử */
  getHistory(): SavedMeetingSession[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as SavedMeetingSession[];
    } catch (e) {
      console.warn('[MeetingHistory] Failed to parse history:', e);
      return [];
    }
  }

  /** Lấy 1 phiên cụ thể */
  getSession(id: string): SavedMeetingSession | null {
    return this.getHistory().find(s => s.id === id) || null;
  }

  /** Xóa 1 phiên */
  deleteSession(id: string): boolean {
    const history = this.getHistory();
    const filtered = history.filter(s => s.id !== id);
    if (filtered.length === history.length) return false;
    this.persist(filtered);
    return true;
  }

  /** Xóa toàn bộ */
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /** Cập nhật tag cho 1 phiên */
  updateSessionTag(id: string, tag: MeetingSessionTag): boolean {
    const history = this.getHistory();
    const session = history.find(s => s.id === id);
    if (!session) return false;
    session.tag = tag;
    this.persist(history);
    return true;
  }

  /** Cập nhật title cho 1 phiên */
  updateSessionTitle(id: string, title: string): boolean {
    const history = this.getHistory();
    const session = history.find(s => s.id === id);
    if (!session) return false;
    session.title = title;
    this.persist(history);
    return true;
  }

  // ═══════════════════════════════════════════════════════
  // CROSS-SESSION SEARCH
  // ═══════════════════════════════════════════════════════

  /**
   * Tìm kiếm nội dung xuyên tất cả phiên đã lưu
   */
  searchAcrossSessions(query: string, maxResults = 20): CrossSearchResult[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    const tokens = q.split(/\s+/).filter(Boolean);
    const history = this.getHistory();
    const results: CrossSearchResult[] = [];

    for (const session of history) {
      for (const note of session.notes) {
        const lower = (note.content + ' ' + note.speaker).toLowerCase();
        let score = 0;

        // Exact phrase match
        if (lower.includes(q)) score += q.length * 3;

        // Token matches
        for (const token of tokens) {
          if (token.length < 2) continue;
          if (lower.includes(token)) score += token.length;
        }

        if (score > 0) {
          results.push({
            sessionId: session.id,
            sessionTitle: session.title,
            sessionTag: session.tag,
            sessionDate: session.startedAt,
            note,
            matchScore: score,
          });
        }
      }
    }

    return results
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, maxResults);
  }

  // ═══════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════

  /**
   * Thống kê tổng quan toàn bộ lịch sử meeting
   */
  getAnalytics(): MeetingAnalytics {
    const history = this.getHistory();

    const tagDistribution: Record<MeetingSessionTag, number> = {
      meeting: 0, lecture: 0, brainstorm: 0, interview: 0, other: 0,
    };

    let totalNotes = 0, totalDuration = 0;
    let totalDecisions = 0, totalActions = 0, totalQuestions = 0;
    const dateMap = new Map<string, number>();

    for (const session of history) {
      totalNotes += session.noteCount;
      totalDuration += (session.endedAt - session.startedAt) / 60000;
      totalDecisions += session.stats.decisionCount;
      totalActions += session.stats.actionCount;
      totalQuestions += session.stats.questionCount;
      tagDistribution[session.tag || 'other']++;

      const dateKey = new Date(session.startedAt).toLocaleDateString('vi-VN');
      dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + 1);
    }

    // Lấy 7 ngày gần nhất có hoạt động
    const recentActivity = Array.from(dateMap.entries())
      .map(([date, count]) => ({ date, count }))
      .slice(0, 7);

    return {
      totalSessions: history.length,
      totalNotes,
      totalDurationMinutes: Math.round(totalDuration),
      totalDecisions,
      totalActions,
      totalQuestions,
      avgNotesPerSession: history.length > 0 ? Math.round(totalNotes / history.length) : 0,
      avgDurationMinutes: history.length > 0 ? Math.round(totalDuration / history.length) : 0,
      tagDistribution,
      recentActivity,
    };
  }

  // ═══════════════════════════════════════════════════════
  // EXPORT TEMPLATES
  // ═══════════════════════════════════════════════════════

  /** Xuất 1 phiên ra Markdown */
  exportToMarkdown(sessionId: string, template: ExportTemplate = 'full'): string | null {
    const session = this.getSession(sessionId);
    if (!session) return null;
    return this.buildMarkdown(session, template);
  }

  /** Xuất phiên hiện tại (chưa lưu) ra Markdown */
  exportCurrentToMarkdown(notes: MeetingNoteEntry[], title?: string, template: ExportTemplate = 'full'): string {
    const fakeSession: SavedMeetingSession = {
      id: 'current',
      title: title || 'Phiên ghi chú hiện tại',
      tag: this.autoDetectTag(notes),
      startedAt: notes[0]?.timestamp || Date.now(),
      endedAt: notes[notes.length - 1]?.timestamp || Date.now(),
      notes,
      noteCount: notes.length,
      stats: this.calculateStats(notes),
    };
    return this.buildMarkdown(fakeSession, template);
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════

  private persist(history: SavedMeetingSession[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.error('[MeetingHistory] Failed to persist:', e);
    }
  }

  /**
   * Auto-detect tag dựa trên nội dung ghi chú
   */
  private autoDetectTag(notes: MeetingNoteEntry[]): MeetingSessionTag {
    const allText = notes.map(n => n.content + ' ' + n.speaker).join(' ').toLowerCase();

    // Lecture indicators: Giáo viên, sinh viên, bài giảng, công thức, ví dụ, bài tập
    const lectureKeywords = ['giáo viên', 'giảng viên', 'thầy', 'cô', 'sinh viên', 'học sinh',
      'bài giảng', 'chương', 'công thức', 'định nghĩa', 'ví dụ', 'bài tập', 'kiểm tra',
      'teacher', 'student', 'lecture', 'formula', 'chapter', 'exam'];
    const lectureScore = lectureKeywords.filter(k => allText.includes(k)).length;

    // Brainstorm indicators
    const brainstormKeywords = ['ý tưởng', 'brainstorm', 'idea', 'sáng tạo', 'đề xuất', 'phương án',
      'proposal', 'creative', 'thử nghiệm', 'prototype'];
    const brainstormScore = brainstormKeywords.filter(k => allText.includes(k)).length;

    // Interview indicators  
    const interviewKeywords = ['phỏng vấn', 'ứng viên', 'kinh nghiệm', 'interview', 'candidate',
      'cv', 'resume', 'tuyển dụng', 'salary', 'lương'];
    const interviewScore = interviewKeywords.filter(k => allText.includes(k)).length;

    if (lectureScore >= 3) return 'lecture';
    if (brainstormScore >= 2) return 'brainstorm';
    if (interviewScore >= 2) return 'interview';
    return 'meeting';
  }

  /**
   * Tạo tiêu đề thông minh dựa trên nội dung + tag
   */
  private generateSmartTitle(notes: MeetingNoteEntry[], startedAt: number, tag: MeetingSessionTag): string {
    const dateStr = new Date(startedAt).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const tagLabels: Record<MeetingSessionTag, string> = {
      meeting: '📋 Cuộc họp',
      lecture: '📚 Bài giảng',
      brainstorm: '💡 Brainstorm',
      interview: '🎤 Phỏng vấn',
      other: '📝 Ghi chú',
    };

    // Tìm chủ đề chính từ decisions hoặc speech đầu tiên
    const keyNote = notes.find(n => n.type === 'decision') || notes.find(n => n.type === 'speech');
    if (keyNote && keyNote.content.length > 8) {
      const topic = keyNote.content.substring(0, 35).replace(/[\"*_#]/g, '');
      return `${tagLabels[tag]}: ${topic}${keyNote.content.length > 35 ? '...' : ''} — ${dateStr}`;
    }

    return `${tagLabels[tag]} ${dateStr}`;
  }

  private calculateStats(notes: MeetingNoteEntry[]) {
    const stats = { speechCount: 0, decisionCount: 0, actionCount: 0, questionCount: 0 };
    for (const note of notes) {
      switch (note.type) {
        case 'speech': stats.speechCount++; break;
        case 'decision': stats.decisionCount++; break;
        case 'action': stats.actionCount++; break;
        case 'question': stats.questionCount++; break;
      }
    }
    return stats;
  }

  private buildMarkdown(session: SavedMeetingSession, template: ExportTemplate): string {
    switch (template) {
      case 'compact': return this.buildCompactMarkdown(session);
      case 'lecture': return this.buildLectureMarkdown(session);
      default: return this.buildFullMarkdown(session);
    }
  }

  // ── TEMPLATE: Full Meeting Report ─────────────────────
  private buildFullMarkdown(session: SavedMeetingSession): string {
    const startDate = new Date(session.startedAt);
    const endDate = new Date(session.endedAt);
    const duration = Math.round((session.endedAt - session.startedAt) / 60000);
    const tagLabels: Record<MeetingSessionTag, string> = {
      meeting: 'Cuộc họp', lecture: 'Bài giảng', brainstorm: 'Brainstorm', interview: 'Phỏng vấn', other: 'Ghi chú'
    };

    const lines: string[] = [];
    lines.push(`# 📋 ${session.title}`);
    lines.push('');
    lines.push(`## Thông tin`);
    lines.push(`- **Loại:** ${tagLabels[session.tag] || 'Cuộc họp'}`);
    lines.push(`- **Bắt đầu:** ${startDate.toLocaleString('vi-VN')}`);
    lines.push(`- **Kết thúc:** ${endDate.toLocaleString('vi-VN')}`);
    lines.push(`- **Thời lượng:** ~${duration} phút`);
    lines.push(`- **Tổng ghi chú:** ${session.noteCount}`);
    lines.push('');

    lines.push(`## Thống kê`);
    lines.push(`| Loại | Số lượng |`);
    lines.push(`|------|----------|`);
    lines.push(`| 💬 Nội dung thảo luận | ${session.stats.speechCount} |`);
    lines.push(`| ✅ Quyết định | ${session.stats.decisionCount} |`);
    lines.push(`| ⚡ Nhiệm vụ | ${session.stats.actionCount} |`);
    lines.push(`| ❓ Câu hỏi | ${session.stats.questionCount} |`);
    lines.push('');

    // Pinned notes đầu tiên
    const pinnedNotes = session.notes.filter(n => n.isPinned);
    if (pinnedNotes.length > 0) {
      lines.push(`## 📌 Ghi chú quan trọng`);
      for (const note of pinnedNotes) {
        const time = new Date(note.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        lines.push(`- **[${time}] ${note.speaker}:** ${note.content}`);
      }
      lines.push('');
    }

    // Nhóm theo loại
    const typeLabels: Record<MeetingNoteType, string> = {
      speech: '## 💬 Nội dung thảo luận',
      decision: '## ✅ Quyết định',
      action: '## ⚡ Nhiệm vụ & Phân công',
      question: '## ❓ Câu hỏi',
    };
    const typeOrder: MeetingNoteType[] = ['decision', 'action', 'question', 'speech'];

    for (const type of typeOrder) {
      const filtered = session.notes.filter(n => n.type === type);
      if (filtered.length === 0) continue;
      lines.push(typeLabels[type]);
      for (const note of filtered) {
        const time = new Date(note.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        lines.push(`- **[${time}] ${note.speaker}:** ${note.content}`);
      }
      lines.push('');
    }

    lines.push(`## 📝 Timeline chi tiết`);
    for (const note of session.notes) {
      const time = new Date(note.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const typeIcon = { speech: '💬', decision: '✅', action: '⚡', question: '❓' }[note.type] || '📝';
      const pin = note.isPinned ? '📌 ' : '';
      lines.push(`- ${pin}${typeIcon} **[${time}] ${note.speaker}:** ${note.content}`);
    }

    lines.push('');
    lines.push('---');
    lines.push(`*Ghi chú tự động bởi Aura Assistant — ${new Date().toLocaleDateString('vi-VN')}*`);
    return lines.join('\n');
  }

  // ── TEMPLATE: Lecture Notes ───────────────────────────
  private buildLectureMarkdown(session: SavedMeetingSession): string {
    const startDate = new Date(session.startedAt);
    const duration = Math.round((session.endedAt - session.startedAt) / 60000);

    const lines: string[] = [];
    lines.push(`# 📚 Ghi chú bài giảng`);
    lines.push('');
    lines.push(`**Ngày:** ${startDate.toLocaleDateString('vi-VN')} | **Thời lượng:** ~${duration} phút`);
    lines.push('');

    // Kiến thức trọng tâm (decisions = key takeaways in lecture context)
    const keyTakeaways = session.notes.filter(n => n.type === 'decision' || n.isPinned);
    if (keyTakeaways.length > 0) {
      lines.push(`## 🎯 Kiến thức trọng tâm`);
      for (const note of keyTakeaways) {
        lines.push(`- ${note.content}`);
      }
      lines.push('');
    }

    // Nội dung bài giảng (speech notes grouped by speaker)
    const speechNotes = session.notes.filter(n => n.type === 'speech');
    if (speechNotes.length > 0) {
      lines.push(`## 📝 Nội dung chính`);
      for (const note of speechNotes) {
        lines.push(`- **${note.speaker}:** ${note.content}`);
      }
      lines.push('');
    }

    // Câu hỏi & Thảo luận
    const questions = session.notes.filter(n => n.type === 'question');
    if (questions.length > 0) {
      lines.push(`## ❓ Câu hỏi & Thảo luận`);
      for (const note of questions) {
        lines.push(`- **${note.speaker}:** ${note.content}`);
      }
      lines.push('');
    }

    // Bài tập & Nhiệm vụ
    const actions = session.notes.filter(n => n.type === 'action');
    if (actions.length > 0) {
      lines.push(`## 📋 Bài tập & Nhiệm vụ`);
      for (const note of actions) {
        lines.push(`- [ ] ${note.content}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push(`*Ghi chú bởi Aura — ${new Date().toLocaleDateString('vi-VN')}*`);
    return lines.join('\n');
  }

  // ── TEMPLATE: Compact Summary ─────────────────────────
  private buildCompactMarkdown(session: SavedMeetingSession): string {
    const startDate = new Date(session.startedAt);
    const duration = Math.round((session.endedAt - session.startedAt) / 60000);

    const lines: string[] = [];
    lines.push(`# ${session.title}`);
    lines.push(`${startDate.toLocaleDateString('vi-VN')} — ${duration} phút — ${session.noteCount} ghi chú`);
    lines.push('');

    // Chỉ hiện decisions + actions + pinned
    const important = session.notes.filter(n =>
      n.type === 'decision' || n.type === 'action' || n.isPinned
    );

    if (important.length > 0) {
      lines.push(`### Tóm tắt`);
      for (const note of important) {
        const icon = { decision: '✅', action: '⚡', speech: '📌', question: '❓' }[note.type] || '📝';
        lines.push(`- ${icon} ${note.content}`);
      }
    } else {
      // Fallback: top 5 speech notes
      lines.push(`### Nội dung chính`);
      for (const note of session.notes.slice(0, 5)) {
        lines.push(`- ${note.content}`);
      }
    }

    lines.push('');
    lines.push(`---`);
    lines.push(`*Aura Assistant*`);
    return lines.join('\n');
  }
}

export const meetingHistoryService = new MeetingHistoryService();
