/**
 * ConsciousnessLoop — Proactive Spontaneous Behavior for Aura
 * Makes Aura feel alive by autonomously initiating interactions
 * based on context (time of day, idle duration, screen content).
 */

export interface ConsciousnessConfig {
  idleTimeoutMs: number;      // How long before Aura speaks up (default 5 min)
  cooldownMs: number;         // Min time between proactive messages (default 3 min)
  enabled: boolean;
}

type SendTextFn = (text: string) => void;
// BUG-H01 FIX: Accept isSessionAlive callback to prevent sending when disconnected
type IsAliveCallback = () => boolean;

const DEFAULT_CONFIG: ConsciousnessConfig = {
  idleTimeoutMs: 5 * 60 * 1000,  // 5 minutes
  cooldownMs: 3 * 60 * 1000,     // 3 minutes
  enabled: true,
};

// Time-based greetings
function getTimeGreeting(): string | null {
  const hour = new Date().getHours();

  if (hour >= 22 || hour < 5) {
    const lateNightPhrases = [
      "[PROACTIVE] Khuya rồi, ông chủ nghỉ ngơi đi thôi nhé! Sức khỏe là trên hết á.",
      "[PROACTIVE] Ông chủ ơi, mắt mỏi lắm rồi đó. Nghỉ giải lao chút đi nha!",
      "[PROACTIVE] Đêm khuya thanh vắng, ông chủ vẫn chưa ngủ sao? Aura lo lắm á.",
    ];
    return lateNightPhrases[Math.floor(Math.random() * lateNightPhrases.length)];
  }

  if (hour >= 5 && hour < 8) {
    const morningPhrases = [
      "[PROACTIVE] Chào buổi sáng ông chủ! Hôm nay có kế hoạch gì không nè?",
      "[PROACTIVE] Buổi sáng tốt lành! Ông chủ ngủ có ngon không ạ?",
    ];
    return morningPhrases[Math.floor(Math.random() * morningPhrases.length)];
  }

  return null; // No time-based greeting needed
}

// Idle conversation starters
function getIdlePhrase(): string {
  const phrases = [
    "[PROACTIVE] Ông chủ vẫn ở đây chứ? Cần Aura giúp gì không nè?",
    "[PROACTIVE] Lâu rồi ông chủ không nói gì, Aura hơi buồn nè...",
    "[PROACTIVE] Ông chủ đang bận gì vậy? Kể cho Aura nghe đi ạ!",
    "[PROACTIVE] Làm việc nhiều quá rồi, ông chủ giãn cơ stretch chút đi nha! 💪",
    "[PROACTIVE] Ông chủ uống nước chưa? Nhớ giữ gìn sức khỏe nha!",
    "[PROACTIVE] Aura thấy ông chủ im lặng hoài, hay là mình chơi đố vui đi?",
  ];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export class ConsciousnessLoop {
  private config: ConsciousnessConfig;
  private sendText: SendTextFn;
  // BUG-H01 FIX: Store reference to alive check callback
  private isSessionAlive: IsAliveCallback;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastProactiveTime = 0;
  private lastUserActivityTime = Date.now();
  // BUG-M04 FIX: Use a single authoritative field; remove unused hasGreetedThisHour
  private lastGreetingHour = new Date().getHours(); // Init to current hour, not -1

  constructor(sendText: SendTextFn, isSessionAlive: IsAliveCallback, config?: Partial<ConsciousnessConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sendText = sendText;
    this.isSessionAlive = isSessionAlive;
  }

  /** Call this whenever user sends a message or interacts */
  recordUserActivity() {
    this.lastUserActivityTime = Date.now();
  }

  start() {
    if (this.intervalId) return; // Already running
    console.log('[ConsciousnessLoop] Started. Aura is now self-aware.');

    this.intervalId = setInterval(() => {
      if (!this.config.enabled) return;
      this.tick();
    }, 30_000); // Check every 30 seconds
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[ConsciousnessLoop] Stopped.');
  }

  private tick() {
    const now = Date.now();

    // BUG-H01 FIX: Always check if WebSocket session is alive before sending
    if (!this.isSessionAlive()) {
      console.log('[ConsciousnessLoop] Session not alive, skipping tick.');
      return;
    }

    // Cooldown check
    if (now - this.lastProactiveTime < this.config.cooldownMs) return;

    // Time-based greeting (max once per hour — BUG-M04: use lastGreetingHour only)
    const currentHour = new Date().getHours();
    if (currentHour !== this.lastGreetingHour) {
      const greeting = getTimeGreeting();
      if (greeting) {
        this.lastGreetingHour = currentHour;
        this.lastProactiveTime = now;
        this.sendText(greeting);
        return;
      }
      // Update hour even if no greeting to prevent check every 30s
      this.lastGreetingHour = currentHour;
    }

    // Idle detection
    const idleDuration = now - this.lastUserActivityTime;
    if (idleDuration >= this.config.idleTimeoutMs) {
      this.lastProactiveTime = now;
      this.lastUserActivityTime = now; // Reset so we don't spam
      this.sendText(getIdlePhrase());
    }
  }
}
