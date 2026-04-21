/**
 * AdminPanel — User management panel for administrators
 *
 * Features:
 * - List all registered users
 * - Approve / Reject / Ban users
 * - Filter by status
 * - Only visible to users with role === 'admin'
 * - Shows user display names & emails instead of raw IDs
 * - Dashboard with real statistics from Appwrite
 */
import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, XCircle, Shield, Users, Loader2, RefreshCw, Clock, Activity, UserCheck, ShieldCheck, LayoutDashboard, Mail } from 'lucide-react';
import { authService, UserProfile } from '../services/authService';
import { databases, DB_ID, COLLECTION_USERS } from '../services/appwriteConfig';
import { Query } from 'appwrite';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserRow {
  docId: string;
  userId: string;
  displayName: string;
  email: string;
  role: string;
  isApproved: boolean;
  createdAt: string;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'dashboard'>('dashboard');

  useEffect(() => {
    if (isOpen) loadUsers();
  }, [isOpen]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const docs = await databases.listDocuments(DB_ID, COLLECTION_USERS, [
        Query.limit(100),
        Query.orderDesc('$createdAt'),
      ]);
      setUsers(docs.documents.map(doc => ({
        docId: doc.$id,
        userId: doc.user_id as string,
        displayName: (doc.display_name as string) || '',
        email: (doc.email as string) || '',
        role: (doc.role as string) || 'user',
        isApproved: doc.is_activated === true,
        createdAt: doc.$createdAt,
      })));
    } catch (e) {
      console.error('[AdminPanel] Load users error:', e);
    }
    setLoading(false);
  };

  const handleApprove = async (docId: string) => {
    setActionLoading(docId);
    try {
      await authService.updateUserStatus(docId, { is_activated: true });
      setUsers(prev => prev.map(u => u.docId === docId ? { ...u, isApproved: true } : u));
    } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  const handleReject = async (docId: string) => {
    setActionLoading(docId);
    try {
      await authService.updateUserStatus(docId, { is_activated: false });
      setUsers(prev => prev.map(u => u.docId === docId ? { ...u, isApproved: false } : u));
    } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  const handleSetAdmin = async (docId: string) => {
    setActionLoading(docId);
    try {
      await authService.updateUserStatus(docId, { role: 'admin', is_activated: true });
      setUsers(prev => prev.map(u => u.docId === docId ? { ...u, role: 'admin', isApproved: true } : u));
    } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  if (!isOpen) return null;

  const filtered = users.filter(u => {
    if (filter === 'pending') return !u.isApproved;
    if (filter === 'approved') return u.isApproved;
    return true;
  });

  // ── Real statistics computed from actual user data ──
  const totalUsers = users.length;
  const pendingCount = users.filter(u => !u.isApproved).length;
  const approvedCount = users.filter(u => u.isApproved).length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const approvalRate = totalUsers > 0 ? Math.round((approvedCount / totalUsers) * 100) : 0;

  // ── Registration timeline for the past 30 days ──
  const getRegistrationTimeline = () => {
    const days = 30;
    const now = new Date();
    const timeline: { date: string; count: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = users.filter(u => u.createdAt.startsWith(dateStr)).length;
      timeline.push({ date: dateStr, count });
    }
    return timeline;
  };

  const timeline = getRegistrationTimeline();
  const maxTimelineCount = Math.max(...timeline.map(t => t.count), 1);

  /** Helper: get initials from name or email */
  const getInitials = (user: UserRow): string => {
    if (user.displayName) {
      const parts = user.displayName.trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      return user.displayName.slice(0, 2).toUpperCase();
    }
    if (user.email) return user.email.slice(0, 2).toUpperCase();
    return user.userId.slice(0, 2).toUpperCase();
  };

  /** Helper: get best display label for a user */
  const getUserLabel = (user: UserRow): string => {
    if (user.displayName) return user.displayName;
    if (user.email) return user.email;
    return user.userId;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl mx-4 max-h-[85vh] bg-[#0f0f1a]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Shield size={20} className="text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Trang Quản Trị Hệ Thống</h2>
              <p className="text-xs text-white/40">Aura Assistant • SGP Cloud Backend</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white/5 rounded-lg p-1 mr-2 flex">
              <button 
                onClick={() => setActiveTab('dashboard')} 
                className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide flex items-center gap-1.5 transition-all ${activeTab === 'dashboard' ? 'bg-purple-500/20 text-purple-300' : 'text-white/40 hover:text-white/70'}`}
              >
                <LayoutDashboard size={14} /> Tổng quan
              </button>
              <button 
                onClick={() => setActiveTab('users')} 
                className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide flex items-center gap-1.5 transition-all ${activeTab === 'users' ? 'bg-purple-500/20 text-purple-300' : 'text-white/40 hover:text-white/70'}`}
              >
                <Users size={14} /> Người dùng
                {pendingCount > 0 && <span className="bg-amber-500 text-amber-950 px-1.5 py-0.5 rounded-full text-[9px] ml-1">{pendingCount}</span>}
              </button>
            </div>
            {activeTab === 'users' && (
              <button onClick={loadUsers} className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-all">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-all">
              <X size={18} />
            </button>
          </div>
        </div>

        {activeTab === 'dashboard' ? (
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-white/30">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Total Users Card */}
                  <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
                    <Users size={24} className="text-purple-400 mb-2" />
                    <span className="text-xs text-white/50 mb-1">Tổng người dùng</span>
                    <span className="text-2xl font-bold text-white tracking-widest whitespace-nowrap">{totalUsers}</span>
                  </div>

                  {/* Pending Card */}
                  <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
                    <Clock size={24} className="text-amber-400 mb-2" />
                    <span className="text-xs text-white/50 mb-1">Chờ duyệt</span>
                    <span className="text-2xl font-bold text-white tracking-widest whitespace-nowrap">{pendingCount}</span>
                  </div>

                  {/* Approved Card */}
                  <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
                    <UserCheck size={24} className="text-green-400 mb-2" />
                    <span className="text-xs text-white/50 mb-1">Đã duyệt</span>
                    <span className="text-2xl font-bold text-white tracking-widest whitespace-nowrap">{approvedCount}<span className="text-sm text-white/50 ml-1">({approvalRate}%)</span></span>
                  </div>

                  {/* Admin Count Card */}
                  <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
                    <ShieldCheck size={24} className="text-blue-400 mb-2" />
                    <span className="text-xs text-white/50 mb-1">Quản trị viên</span>
                    <span className="text-2xl font-bold text-white tracking-widest whitespace-nowrap">{adminCount}</span>
                  </div>
                </div>

                {/* Registration Timeline Chart */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 relative overflow-hidden">
                  <h3 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2"><Activity size={16} className="text-blue-400" /> Đăng ký mới trong 30 ngày qua</h3>
                  <div className="h-32 flex items-end justify-between gap-[2px] mt-6">
                    {timeline.map((day, i) => {
                      const height = day.count > 0 ? Math.max(10, (day.count / maxTimelineCount) * 100) : 4;
                      const dateObj = new Date(day.date);
                      const label = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
                      return (
                        <div
                          key={i}
                          className="flex-1 relative group cursor-crosshair"
                          style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}
                        >
                          <div
                            className={`w-full rounded-t-sm transition-all ${
                              day.count > 0
                                ? 'bg-gradient-to-t from-purple-500/30 to-blue-400/80 hover:brightness-150'
                                : 'bg-white/5'
                            }`}
                            style={{ height: `${height}%` }}
                          />
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-10">
                            <div className="bg-black/90 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white whitespace-nowrap shadow-xl">
                              <div className="font-bold">{label}</div>
                              <div className="text-white/60">{day.count} đăng ký</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-[9px] text-white/30">
                    <span>{new Date(timeline[0]?.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
                    <span>Hôm nay</span>
                  </div>
                </div>

                {/* Recent registrations quick list */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                  <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2"><Users size={16} className="text-purple-400" /> Đăng ký gần đây</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {users.slice(0, 5).map(user => (
                      <div key={user.docId} className="flex items-center gap-3 text-xs">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          user.role === 'admin' ? 'bg-purple-500/20 text-purple-300' :
                          user.isApproved ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {getInitials(user)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-white/80 font-medium truncate block">{getUserLabel(user)}</span>
                        </div>
                        <span className={`text-[10px] ${user.isApproved ? 'text-green-400' : 'text-amber-400'}`}>
                          {user.isApproved ? '✓ Đã duyệt' : '⏳ Chờ duyệt'}
                        </span>
                        <span className="text-white/30">{new Date(user.createdAt).toLocaleDateString('vi-VN')}</span>
                      </div>
                    ))}
                    {users.length === 0 && (
                      <div className="text-center text-white/30 py-4">Chưa có người dùng nào</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Filter tabs */}
            <div className="px-6 py-3 flex gap-2 border-b border-white/5">
              {(['all', 'pending', 'approved'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filter === f
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                  }`}
                >
                  {f === 'all' && `Tất cả (${users.length})`}
                  {f === 'pending' && `Chờ duyệt (${pendingCount})`}
                  {f === 'approved' && `Đã duyệt (${users.length - pendingCount})`}
                </button>
              ))}
            </div>

            {/* User list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-white/30">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-white/30 text-sm">
                  <Users size={32} className="mx-auto mb-3 opacity-30" />
                  Không có người dùng nào
                </div>
              ) : (
                filtered.map(user => (
                  <div key={user.docId} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/[0.05] transition-all">
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      user.role === 'admin' ? 'bg-purple-500/20 text-purple-300' : 
                      user.isApproved ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {getInitials(user)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium truncate">{getUserLabel(user)}</span>
                        {user.role === 'admin' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-bold">ADMIN</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/30 mt-1">
                        {/* Show email beneath the name if both exist */}
                        {user.email && user.displayName && (
                          <>
                            <Mail size={11} className="text-white/20" />
                            <span className="truncate max-w-[160px]">{user.email}</span>
                            <span>•</span>
                          </>
                        )}
                        <Clock size={11} />
                        <span>{new Date(user.createdAt).toLocaleDateString('vi-VN')}</span>
                        <span>•</span>
                        <span className={user.isApproved ? 'text-green-400' : 'text-amber-400'}>
                          {user.isApproved ? '✓ Đã duyệt' : '⏳ Chờ duyệt'}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {actionLoading === user.docId ? (
                        <Loader2 size={16} className="animate-spin text-white/30" />
                      ) : (
                        <>
                          {!user.isApproved && (
                            <button
                              onClick={() => handleApprove(user.docId)}
                              className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-all"
                              title="Phê duyệt"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          {user.isApproved && user.role !== 'admin' && (
                            <button
                              onClick={() => handleReject(user.docId)}
                              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"
                              title="Thu hồi"
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                          {user.role !== 'admin' && (
                            <button
                              onClick={() => handleSetAdmin(user.docId)}
                              className="p-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 transition-all"
                              title="Nâng cấp Admin"
                            >
                              <Shield size={16} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
