import React from 'react';
import { X, Youtube, ExternalLink, PlayCircle, Music2, Headphones } from 'lucide-react';
import { VideoState } from '../types';

interface VideoPlayerProps {
  state: VideoState;
  onClose: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ state, onClose }) => {
  // BUG-M06 FIX: Guard against empty URL (would open search with blank query)
  if (!state.isOpen || !state.url) return null;

  const isZingMp3 = state.type === 'zingmp3';

  // ── YouTube logic ──────────────────────────────────────────
  // Video ID chuẩn YouTube luôn có đúng 11 ký tự
  const isVideoId = !isZingMp3 && /^[a-zA-Z0-9_-]{11}$/.test(state.url);
  const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';

  // ── External links ─────────────────────────────────────────
  const getExternalLink = () => {
    if (isZingMp3) {
      return `https://zingmp3.vn/tim-kiem/tat-ca?q=${encodeURIComponent(state.url)}`;
    }
    if (isVideoId) {
      return `https://www.youtube.com/watch?v=${state.url}`;
    }
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(state.url)}`;
  };

  const externalLink = getExternalLink();

  // ── Platform branding ──────────────────────────────────────
  const platformConfig = isZingMp3
    ? {
        icon: <Music2 className="text-white" size={18} />,
        bgColor: 'bg-purple-600',
        accentColor: 'text-purple-400',
        btnBg: 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700',
        btnShadow: 'shadow-purple-900/40',
        label: 'Zing MP3',
        searchLabel: 'Nghe ngay trên Zing MP3',
        bgImage: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=1000&auto=format&fit=crop',
        noteText: '*Nhấn để mở Zing MP3 và nghe nhạc trực tiếp.',
      }
    : {
        icon: <Youtube className="text-white" size={18} />,
        bgColor: 'bg-red-600',
        accentColor: 'text-red-400',
        btnBg: 'bg-red-600 hover:bg-red-700',
        btnShadow: 'shadow-red-900/40',
        label: 'YouTube',
        searchLabel: 'Xem ngay trên YouTube',
        bgImage: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop',
        noteText: '*Video này không hỗ trợ phát trực tiếp trên ứng dụng do bản quyền.',
      };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-300 p-4">
      {/* Khung Player */}
      <div className="relative w-full max-w-5xl aspect-video bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl border border-neutral-800 flex flex-col">

        {/* --- HEADER --- */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent z-20 flex justify-between items-center pointer-events-none">
          {/* Tiêu đề */}
          <div className="flex items-center gap-3 pointer-events-auto">
            <div className={`p-1.5 ${platformConfig.bgColor} rounded-lg shadow-lg`}>
              {platformConfig.icon}
            </div>
            <span className="font-medium text-white text-sm md:text-lg tracking-wide drop-shadow-md truncate max-w-[200px] md:max-w-xl">
              {state.title || `${platformConfig.label} Player`}
            </span>
          </div>

          {/* Nút đóng & Mở tab mới */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <a
              href={externalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur transition-all text-xs md:text-sm text-white font-medium group"
            >
              <span className="hidden sm:inline">Mở trên {platformConfig.label}</span>
              <ExternalLink size={16} className="opacity-70 group-hover:opacity-100" />
            </a>

            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-red-500/80 rounded-full backdrop-blur transition-all text-white hover:rotate-90 duration-200"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* --- NỘI DUNG CHÍNH --- */}
        <div className="flex-1 w-full h-full bg-black relative flex items-center justify-center overflow-hidden">

          {/* YouTube with Video ID → Embed Player */}
          {!isZingMp3 && isVideoId ? (
            <iframe
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${state.url}?autoplay=1&controls=1&origin=${origin}&rel=0&modestbranding=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="w-full h-full object-cover z-10"
            ></iframe>
          ) : (
            /* Search Preview Card (YouTube search / Zing MP3) */
            <div className="relative w-full h-full flex flex-col items-center justify-center text-center p-6 bg-neutral-900">

              {/* Background effect */}
              <div
                className="absolute inset-0 bg-cover bg-center opacity-10 blur-xl scale-110"
                style={{ backgroundImage: `url('${platformConfig.bgImage}')` }}
              ></div>
              <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/80 to-transparent"></div>

              {/* Content Card */}
              <div className="relative z-10 max-w-lg space-y-6 animate-in slide-in-from-bottom-10 fade-in duration-500">
                <div className="w-20 h-20 mx-auto bg-neutral-800 rounded-3xl flex items-center justify-center shadow-2xl border border-neutral-700">
                  {isZingMp3 ? (
                    <Headphones size={40} className="text-purple-400" />
                  ) : (
                    <PlayCircle size={40} className="text-red-500" />
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl md:text-3xl font-bold text-white">
                    {isZingMp3 ? 'Nghe nhạc' : 'Kết quả tìm kiếm'}
                  </h3>
                  <p className="text-neutral-400 text-base">
                    {isZingMp3 ? (
                      <>
                        Aura đã tìm bài hát cho bạn: <br />
                        <span className="text-purple-400 font-semibold italic">"{state.url}"</span>
                      </>
                    ) : (
                      <>
                        Aura đã tìm thấy video cho từ khóa: <br />
                        <span className="text-blue-400 font-semibold italic">"{state.url}"</span>
                      </>
                    )}
                  </p>
                </div>

                {/* Platform-specific buttons */}
                <div className="pt-4 flex flex-col items-center gap-3">
                  <a
                    href={externalLink}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-3 px-8 py-4 ${platformConfig.btnBg} text-white rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-xl ${platformConfig.btnShadow}`}
                  >
                    {isZingMp3 ? (
                      <Music2 size={24} />
                    ) : (
                      <Youtube size={24} fill="currentColor" />
                    )}
                    <span>{platformConfig.searchLabel}</span>
                  </a>

                  {/* Secondary: also offer YouTube for music searches */}
                  {isZingMp3 && (
                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(state.url)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-xl font-medium text-sm transition-all border border-white/10"
                    >
                      <Youtube size={18} className="text-red-500" />
                      <span>Hoặc xem trên YouTube</span>
                    </a>
                  )}

                  <p className="mt-2 text-xs text-neutral-600">
                    {platformConfig.noteText}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default VideoPlayer;
