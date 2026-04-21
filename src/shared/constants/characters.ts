
// ============================================================
// CHARACTER MODEL REGISTRY
// Thêm model mới vào đây để hiện trong Settings > Appearance
// ============================================================
export interface CharacterModel {
  name: string;
  emoji: string;
  desc: string;
  url: string;
  displayMode?: 'portrait' | 'full'; 
}

export const CHARACTER_MODELS: Record<string, CharacterModel> = {
  haru: {
    name: 'Haru',
    emoji: '🌸',
    desc: 'Cô gái dễ thương mặc định',
    // ✅ Verified: pixi-live2d-display official test asset (Cubism 3)
    url: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json',
  },
  hiyori: {
    name: 'Hiyori',
    emoji: '💖',
    desc: 'Nhân vật Hiyori từ Live2D SDK chính thức',
    // ✅ Verified: Live2D/CubismWebSamples official (Cubism 3)
    url: 'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples/Samples/Resources/Hiyori/Hiyori.model3.json',
  },
  shizuku: {
    name: 'Shizuku',
    emoji: '✨',
    desc: 'Cô gái cổ điển Shizuku (Cubism 2)',
    url: 'https://raw.githubusercontent.com/guansss/pixi-live2d-display/master/test/assets/shizuku/shizuku.model.json',
    displayMode: 'full', // Ngồi nên cần show toàn thân
  },
  wanko: {
    name: 'Wanko',
    emoji: '🐾',
    desc: 'Cô bé Wanko từ Live2D SDK chính thức',
    url: 'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples/Samples/Resources/Wanko/Wanko.model3.json',
    displayMode: 'full', // Nằm trong chén nên cần show toàn thân
  },
  custom: {
    name: 'Custom',
    emoji: '🔗',
    desc: 'Dùng URL model của riêng bạn',
    url: '',
    displayMode: 'portrait',
  },
};

export const DEFAULT_CHARACTER_ID = 'haru';
