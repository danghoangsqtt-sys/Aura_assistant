/**
 * LoginScreen — Glassmorphism login/register UI
 *
 * WebApp: Email/Password with register tab
 * Electron: Google OAuth via CLIProxyAPI
 */
import React, { useState } from 'react';
import { LogIn, UserPlus, Mail, Lock, User, Loader2, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { authService, UserProfile } from '../services/authService';

interface LoginScreenProps {
  platform: 'web' | 'electron';
  onLoginSuccess: (user: UserProfile) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ platform, onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  // ── Auth Handlers ──
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPendingApproval(false);

    try {
      let user: UserProfile;
      const cleanEmail = email.trim();
      const cleanDisplayName = displayName.trim();

      if (isRegister) {
        if (!cleanDisplayName) {
          setError('Vui lòng nhập tên hiển thị.');
          setLoading(false);
          return;
        }
        user = await authService.register(cleanEmail, password, cleanDisplayName);
      } else {
        user = await authService.login(cleanEmail, password);
      }

      if (!user.isApproved) {
        setPendingApproval(true);
        setLoading(false);
        return;
      }

      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Lỗi xác thực.');
      setLoading(false);
    }
  };

  // ── Pending Approval Screen ──
  if (pendingApproval) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#111133] to-[#0a0a2a] z-50">
        <div className="w-full max-w-md mx-4">
          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/10 flex items-center justify-center">
              <ShieldAlert size={40} className="text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Tài khoản chờ phê duyệt</h2>
            <p className="text-white/60 text-sm leading-relaxed mb-6">
              Tài khoản của bạn đã được tạo thành công. Vui lòng chờ Admin kích hoạt tài khoản trước khi có thể sử dụng Aura.
            </p>
            <div className="flex items-center justify-center gap-2 text-amber-300/80 text-xs mb-6">
              <Loader2 size={14} className="animate-spin" />
              <span>Đang chờ phê duyệt...</span>
            </div>
            <button
              onClick={() => { setPendingApproval(false); authService.logout(); }}
              className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm transition-all"
            >
              Quay lại đăng nhập
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Login UI ──
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#0a0a1a] via-[#111133] to-[#0a0a2a] z-50 overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="w-full max-w-md mx-4 relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/aura_npc_logo.png" alt="Aura" className="w-20 h-20 mx-auto mb-4 rounded-2xl shadow-lg shadow-purple-500/20" />
          <h1 className="text-3xl font-bold text-white tracking-tight">Aura Assistant</h1>
          <p className="text-white/40 text-sm mt-1">
            {platform === 'electron' ? 'Đăng nhập để bắt đầu' : (isRegister ? 'Tạo tài khoản mới' : 'Đăng nhập để tiếp tục')}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/40">

          {/* Tab switcher */}
          <div className="flex border-b border-white/5">
            <button
              onClick={() => { setIsRegister(false); setError(null); }}
              className={`flex-1 py-3.5 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                !isRegister ? 'text-white bg-white/5 border-b-2 border-purple-400' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <LogIn size={15} /> Đăng nhập
            </button>
            <button
              onClick={() => { setIsRegister(true); setError(null); }}
              className={`flex-1 py-3.5 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                isRegister ? 'text-white bg-white/5 border-b-2 border-blue-400' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <UserPlus size={15} /> Đăng ký
            </button>
          </div>

          <div className="p-6">
            {/* Error message */}
            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-start gap-2">
                <ShieldAlert size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Email/Password Form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {isRegister && (
                <div className="relative">
                  <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    placeholder="Tên hiển thị"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.07] transition-all"
                  />
                </div>
              )}

              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.07] transition-all"
                />
              </div>

              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="password"
                  placeholder="Mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-purple-500/50 focus:bg-white/[0.07] transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-lg shadow-purple-500/20"
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Đang xử lý...</>
                ) : isRegister ? (
                  <><UserPlus size={16} /> Đăng ký</>
                ) : (
                  <><LogIn size={16} /> Đăng nhập</>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/20 text-xs mt-6 px-4">
          Nội dung sản phẩm này được nghiên cứu và phát triển bởi DHsystem_LÊ BÁ ĐĂNG HOÀNG
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;
