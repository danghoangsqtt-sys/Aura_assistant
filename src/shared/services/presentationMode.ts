/**
 * ============================================================
 * PRESENTATION MODE — Dedicated Module
 * ============================================================
 * Luồng 2 giai đoạn:
 *   Giai đoạn 1 — init: đọc PPTX, xem lướt toàn bộ slide, xác nhận sẵn sàng
 *   Giai đoạn 2 — start: bật slideshow (F5), thuyết trình tự động slide-by-slide
 *
 * Module này bao gồm:
 *   1. getPresentationPrompt() — System instruction cho chế độ thuyết trình
 *   2. presentationToolDeclaration — Tool declaration cho control_presentation
 *   3. handlePresentationToolCall() — Xử lý tool call control_presentation
 *   4. Các hằng số cấu hình (timing, labels…)
 * ============================================================
 */

import { Type, FunctionDeclaration } from "@google/genai";
import { platform } from "../platformBridge";

// ── Types ──────────────────────────────────────────────────────
export type PresentationPhase = 'idle' | 'scanning' | 'ready' | 'presenting' | 'paused_qa';

/**
 * Tín hiệu CHÍNH — slide cuối bài thuyết trình.
 * PRIMARY: 'XIN CHÂN THÀNH CẢM ƠN' là mốc dừng scan (slide cuối).
 * Các tín hiệu khác chỉ dùng làm fallback khi trình bày.
 */
export const END_SLIDE_SIGNALS = [
  'XIN CHÂN THÀNH CẢM ƠN',
  'CHÂN THÀNH CẢM ƠN',
  'THANK YOU',
  'THANKS FOR LISTENING',
  'THE END',
];

/** Tín hiệu dừng scan sớm — chỉ dùng trong phase init */
export const SCAN_STOP_SIGNALS = [
  'XIN CHÂN THÀNH CẢM ƠN',
  'CHÂN THÀNH CẢM ƠN',
  'THANK YOU',
  'THE END',
];

// ── Configuration Constants ────────────────────────────────────
/** Thời gian chờ hiệu ứng chuyển slide của PowerPoint (ms) */
export const SLIDE_TRANSITION_DELAY_MS = 1500;

/** Nhãn hiển thị cho từng action */
export const ACTION_LABELS: Record<string, string> = {
  init: 'Khởi động thuyết trình',
  start: 'Bắt đầu trình chiếu',
  next: 'Sang slide tiếp theo',
  prev: 'Lùi slide trước',
  end: 'Kết thúc trình chiếu',
  pause_auto: 'Tạm dừng thuyết trình (Q&A)',
  resume_auto: 'Tiếp tục thuyết trình',
  goto_main: 'Nhảy đến nội dung chính',
};

// ── 1. System Prompt ───────────────────────────────────────────
/**
 * Trả về đoạn system instruction dành riêng cho Presentation Mode.
 * Được inject vào system prompt chính.
 */
export function getPresentationPrompt(): string {
  return `
    ═══════════════════════════════════════════════════
    PRESENTATION MODE — LUỒNG SLIDE_DONE
    ═══════════════════════════════════════════════════

    ── BƯỚC 1: KHỞI ĐỘNG ───────────────────────────────
    Trigger: "khởi động thuyết trình" | "chuẩn bị" | "bật tính năng thuyết trình"
    → Gọi 1 lần duy nhất: control_presentation(action="init")
    → Nếu bài chưa mở: yêu cầu user mở file trước
    → Khi xong: báo "Aura đã học xong X slide. Sẵn sàng!"
    → DỪNG. Chờ lệnh "BẮT ĐẦU THUYẾT TRÌNH".

    ── BƯỚC 2: BẮT ĐẦU ────────────────────────────────
    Trigger: "BẮT ĐẦU THUYẾT TRÌNH" | "bắt đầu" | "trình chiếu"
    → Gọi 1 lần: control_presentation(action="start")
    → Tool trả về SCRIPT SLIDE 1. Thực hiện NGAY theo thứ tự:
       1. Lời chào ngắn (1-2 câu)
       2. Đọc SCRIPT SLIDE 1
       3. Gọi NGAY: control_presentation(action="slide_done", slide_num=1)

    ── CHU TRÌNH MỖI SLIDE ─────────────────────────────
    Sau mỗi lần slide_done, hệ thống trả về SCRIPT SLIDE tiếp theo.
    Thực hiện ngay, không ngừng, không hỏi:
       1. Đọc SCRIPT được cung cấp
       2. Gọi NGAY: control_presentation(action="slide_done", slide_num=X)
    Lặp lại cho đến khi hệ thống báo slide cuối (XIN CẢM ƠN) hoặc hết bài.

    ── NHẢY ĐẾN NỘI DUNG CHÍNH ────────────────────────
    Trigger: "thuyết trình nội dung chính" | "đến phần chính"
    → Gọi: control_presentation(action="goto_main", slide_num=<số slide>)
    → Sau khi tool trả về SCRIPT, đọc và gọi slide_done.

    ── Q&A ─────────────────────────────────────────────
    Khi có câu hỏi: gọi pause_auto → trả lời → gọi resume_auto.

    ── KẾT THÚC ────────────────────────────────────────
    Trigger: "kết thúc" | "dừng" | "ngừng" | hệ thống báo hết slide
    → Gọi: control_presentation(action="end")
    → Cảm ơn khán giả ngắn gọn.

    ══ QUY TẮC BẮT BUỘC ══
    ✅ Sau mỗi slide: GỌI NGAY slide_done — không trì hoãn, không hỏi.
    ✅ Chỉ đọc nội dung trong SCRIPT được cung cấp — không thêm gì.
    ❌ CẤM hỏi: "Tôi qua slide tiếp theo nhé?", "Bạn có muốn nghe thêm không?".
    ❌ CẤM im lặng chờ lệnh giữa các slide.
    ❌ CẤM gọi action="next" — hệ thống xử lý khi bạn gọi slide_done.
    ❌ CẤM dùng kiến thức training để bổ sung nội dung.
    ❌ CẤM gọi start/init nhiều hơn 1 lần.
    ═══════════════════════════════════════════════════
  `;
}

// ── 2. Tool Declaration ────────────────────────────────────────
/**
 * FunctionDeclaration cho tool control_presentation.
 */
export const presentationToolDeclaration: FunctionDeclaration = {
  name: "control_presentation",
  description:
    "Điều khiển thuyết trình. Luồng: init → start → [slide_done × N] → end. " +
    "'init'=khởi động+xem lướt, 'start'=bật slideshow+nhận script slide 1, " +
    "'slide_done'=xác nhận đã đọc xong slide X → nhận script slide tiếp theo, " +
    "'end'=kết thúc, 'pause_auto'=tạm dừng Q&A, 'resume_auto'=tiếp tục, " +
    "'goto_main'=nhảy đến slide nội dung chính.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        description:
          "Action: 'init' | 'start' | 'slide_done' | 'end' | 'pause_auto' | 'resume_auto' | 'goto_main'.",
      },
      slide_num: {
        type: Type.NUMBER,
        description:
          "Với 'slide_done': số slide vừa đọc xong (VD: 1, 2, 3...). " +
          "Với 'goto_main': số slide cần nhảy đến.",
      },
    },
    required: ["action"],
  },
};

// ── 3. Callbacks Interface ─────────────────────────────────────
export interface PresentationCallbacks {
  onToggleScreenVision?: (enable: boolean) => void;
  onNotification: (msg: string) => void;
  onForceScreenCapture?: () => Promise<void>;
  onSetAutoPresenting?: (enable: boolean) => void;
  /** Trả về đường dẫn file PPTX nếu người dùng đã cấu hình */
  onGetPresentationFilePath?: () => string | undefined;
  /** Cập nhật phase thuyết trình */
  onSetPresentationPhase?: (phase: PresentationPhase) => void;
  /** Lấy phase thuyết trình hiện tại */
  onGetPresentationPhase?: () => PresentationPhase;
  /** Callback sau khi đọc xong PPTX — lưu danh sách slide vào liveService */
  onPresentationRead?: (text: string, pageCount: number) => void;
  /** Cập nhật currentSlideIndex */
  onSetCurrentSlideIndex?: (idx: number) => void;
  /** Lấy currentSlideIndex hiện tại */
  onGetCurrentSlideIndex?: () => number;
  /** Lấy danh sách slides đã parse */
  onGetPresentationSlides?: () => { slideNum: number; content: string }[];
  /** Lưu tổng số slide đã scan */
  onSetScannedSlideCount?: (count: number) => void;
  /** Lấy tổng số slide (scannedSlideCount hoặc presentationSlides.length) */
  onGetTotalSlides?: () => number;
}

// ── Helpers ────────────────────────────────────────────────────
function buildOutlineText(slides: { slideNum: number; content: string }[]): string {
  if (!slides.length) return "(Không có nội dung slide)";
  return slides.map(s =>
    `[SLIDE ${s.slideNum}]\n${s.content.substring(0, 400)}${s.content.length > 400 ? '...' : ''}`
  ).join('\n\n');
}

/**
 * Tạo instruction để AI đọc slide theo format SCRIPT.
 * Không có câu hỏi, không trì hoãn — đọc xong gọi slide_done.
 */
function buildSlideReadInstruction(
  slideIdx: number,
  total: number,
  slideData: { slideNum: number; content: string } | undefined,
  isLastSlide: boolean
): string {
  const header = `[SLIDE ${slideIdx}/${total}]`;

  if (isLastSlide) {
    const script = slideData ? `\n"${slideData.content}"\n` : '';
    return (
      `${header} — SLIDE KẾT THÚC\n` +
      `SCRIPT:${script}\n` +
      "Đọc/thể hiện nội dung slide cảm ơn này.\n" +
      "Sau đó nói lời cảm ơn khán giả ngắn gọn tự nhiên.\n" +
      "Khi xong: gọi NGAY control_presentation(action='end'). KHÔNG HỎI."
    );
  }

  const scriptBlock = slideData
    ? `SCRIPT (đọc chính xác nội dung này):\n════════════════════\n${slideData.content}\n════════════════════`
    : `(Không có text từ file — đọc nội dung từ ảnh màn hình vừa gửi)`;

  return (
    `${header}\n${scriptBlock}\n\n` +
    "QUY TRÌNH BẮT BUỘC (không được thay đổi):\n" +
    `1. Đọc nội dung slide ${slideIdx} (từ SCRIPT hoặc ảnh màn hình)\n` +
    `2. Khi đọc xong: GỌI NGAY control_presentation(action="slide_done", slide_num=${slideIdx})\n` +
    "TUYỆT ĐỐI KHÔNG:\n" +
    "— Hỏi 'tôi qua slide tiếp nhé?', 'bạn có muốn nghe thêm không?'\n" +
    "— Chờ lệnh từ user giữa các slide\n" +
    "— Thêm thông tin ngoài SCRIPT"
  );
}

// ── 4. Tool Call Handler ───────────────────────────────────────
/**
 * Xử lý tool call `control_presentation`.
 *
 * action="init":  Giai đoạn 1 — đọc PPTX, xem lướt toàn bộ slide, trả outline
 * action="start": Giai đoạn 2 — bật F5, kích hoạt auto-presenting
 * action="goto_main": Nhảy đến slide nội dung chính
 * action="pause_auto": Tạm dừng auto-slide khi Q&A
 * action="resume_auto": Tiếp tục auto-slide sau Q&A
 * action="end": Thoát slideshow, tắt screen vision
 */
export async function handlePresentationToolCall(
  action: string,
  slideNum: number | undefined,
  callbacks: PresentationCallbacks
): Promise<Record<string, unknown>> {

  // ── INIT (Giai đoạn 1: Khởi động) ─────────────────────────
  if (action === "init") {
    // Chặn gọi lại khi đang thuyết trình hoặc Q&A
    const phaseAtInit = callbacks.onGetPresentationPhase?.();
    if (phaseAtInit === 'presenting' || phaseAtInit === 'paused_qa') {
      console.log('[PresentationMode] action="init" BLOCKED — already presenting');
      return {
        status: "blocked",
        instruction:
          "Đang thuyết trình rồi — không được khởi động lại.\n" +
          "Nếu muốn kết thúc: gọi control_presentation(action='end').\n" +
          "Tiếp tục thuyết trình slide hiện tại.",
      };
    }

    // Bước 1: Bật mắt xem màn hình
    callbacks.onNotification("👁️ Đang bật mắt xem màn hình...");
    callbacks.onToggleScreenVision?.(true);
    callbacks.onSetPresentationPhase?.('scanning');
    await new Promise(r => setTimeout(r, 800));

    // Bước 2: Đọc nội dung PPTX nếu có đường dẫn file đã cấu hình (tuỳ chọn)
    let slides: { slideNum: number; content: string }[] = [];
    let pageCount = 0;
    const filePath = callbacks.onGetPresentationFilePath?.();

    if (filePath) {
      callbacks.onNotification("📖 Đang đọc nội dung file PPTX...");
      try {
        const doc = await platform.readDocument({ path: filePath });
        if (doc.success && doc.text) {
          pageCount = doc.pageCount || 0;
          callbacks.onPresentationRead?.(doc.text, pageCount);
          const blocks = doc.text.split(/\[SLIDE \d+\]/i).filter(b => b.trim());
          blocks.forEach((block, index) => {
            slides.push({ slideNum: index + 1, content: block.trim() });
          });
          if (pageCount === 0 && slides.length > 0) pageCount = slides.length;
          callbacks.onNotification(`✅ Đã đọc xong ${pageCount} slide từ file!`);
        } else {
          callbacks.onNotification(`⚠️ Không đọc được file (${doc.error}). Sẽ đọc qua màn hình.`);
        }
      } catch {
        callbacks.onNotification("⚠️ Lỗi đọc file. Sẽ đọc nội dung qua màn hình.");
      }
    }

    // Bước 3: Xem lướt toàn bộ slide (visual scan) — F5 → RIGHT×(n-1) → ESC
    // Dừng SỚM khi phát hiện slide "XIN CHÂN THÀNH CẢM ƠN"
    let visualScanDone = false;
    let scannedSlideCount = 0;
    let consecutiveFailCount = 0;
    let foundEndSlide = false;
    const MAX_CONSECUTIVE_FAIL = 2;

    if (platform.controlPresentation) {
      try {
        callbacks.onNotification("🔍 Đang khởi động slideshow để xem lướt qua...");
        const startRes = await platform.controlPresentation({ action: "start" });

        if (startRes.success) {
          await new Promise(r => setTimeout(r, 2500)); // Chờ slideshow mở hoàn toàn

          // Capture slide 1, kiểm tra END signal
          scannedSlideCount = 1;
          callbacks.onNotification(`👁️ Xem slide 1...`);
          await callbacks.onForceScreenCapture?.();
          await new Promise(r => setTimeout(r, 500));

          // Kiểm tra slide 1 (từ PPTX text) có phải slide cuối không
          if (slides.length >= 1) {
            const uc = slides[0].content.toUpperCase();
            if (SCAN_STOP_SIGNALS.some(sig => uc.includes(sig))) {
              foundEndSlide = true;
              callbacks.onNotification(`✅ Đây là slide kết thúc — dừng học.`);
            }
          }

          if (!foundEndSlide) {
            // Lướt qua các slide tiếp theo, dừng ngay khi gặp tín hiệu kết thúc
            const maxSlides = pageCount > 0 ? pageCount : 60;
            for (let i = 2; i <= maxSlides; i++) {
              const nextRes = await platform.controlPresentation({ action: "next" });
              if (!nextRes.success) {
                consecutiveFailCount++;
                if (consecutiveFailCount >= MAX_CONSECUTIVE_FAIL) {
                  console.log(`[PresentationMode] init scan: ${consecutiveFailCount} consecutive fails → stop`);
                  break;
                }
                await new Promise(r => setTimeout(r, 1000));
                continue;
              }
              consecutiveFailCount = 0;
              await new Promise(r => setTimeout(r, 600)); // Chờ animation chuyển slide
              scannedSlideCount = i;

              const slideLabel = pageCount > 0 ? `${i}/${pageCount}` : `${i}`;
              callbacks.onNotification(`👁️ Xem slide ${slideLabel}...`);
              await callbacks.onForceScreenCapture?.();
              await new Promise(r => setTimeout(r, 400));

              // Kiểm tra tín hiệu dừng (từ PPTX text — chính xác và nhanh hơn OCR)
              if (slides.length >= i) {
                const uc = slides[i - 1].content.toUpperCase();
                if (SCAN_STOP_SIGNALS.some(sig => uc.includes(sig))) {
                  foundEndSlide = true;
                  callbacks.onNotification(`✅ Slide ${i}: Phát hiện "XIN CHÂN THÀNH CẢM ƠN" — kết thúc học bài`);
                  console.log(`[PresentationMode] init scan: END signal at slide ${i} → stop`);
                  break;
                }
              }
            }
          }

          // Khi tìm thấy END signal, scannedSlideCount = số slide thực tế
          // KHÔNG dùng pageCount từ file (có thể đếm thừa slide trắng/tiêu đề)
          if (foundEndSlide || scannedSlideCount > 0) {
            // scannedSlideCount là số slide đã thực sự xem qua → dùng làm tổng chính xác
            pageCount = scannedSlideCount;
          } else if (pageCount === 0) {
            pageCount = scannedSlideCount;
          }

          // Thoát slideshow về chế độ xem thông thường
          await platform.controlPresentation({ action: "end" });
          await new Promise(r => setTimeout(r, 1000));

          visualScanDone = true;
          const endNote = foundEndSlide ? ` (dừng tại slide CẢM ƠN)` : '';
          callbacks.onNotification(`✅ Đã xem lướt xong ${scannedSlideCount} slide${endNote}!`);
        } else {
          // F5 thất bại — bài thuyết trình chưa mở
          callbacks.onSetPresentationPhase?.('idle');
          return {
            status: "not_ready",
            instruction:
              "BÀI THUYẾT TRÌNH CHƯA ĐƯỢC MỞ.\n" +
              "Hãy nói với user CHÍNH XÁC câu sau:\n" +
              "'Ông chủ vui lòng mở file thuyết trình trong PowerPoint hoặc Google Slides trước, " +
              "sau đó ra lệnh khởi động tính năng thuyết trình lại cho Aura nhé!'\n" +
              "DỪNG. Không làm gì thêm. Chờ user mở file và ra lệnh lại.",
          };
        }
      } catch (e) {
        console.error('[PresentationMode] init scan error:', e);
        callbacks.onNotification("⚠️ Lỗi khi xem lướt slide.");
        callbacks.onSetPresentationPhase?.('idle');
      }
    }

    // Bước 4: Đặt phase = 'ready' và lưu số slide đã scan làm fallback
    callbacks.onSetPresentationPhase?.('ready');
    callbacks.onSetScannedSlideCount?.(pageCount);

    // Bước 5: Trả về kết quả để AI "học thuộc" bài
    const hasTextContent = slides.length > 0;
    const outline = hasTextContent ? buildOutlineText(slides) : null;

    const scanNote = visualScanDone
      ? `Bạn vừa XEM QUA ${scannedSlideCount} SLIDE qua ảnh màn hình${foundEndSlide ? ' và đã dừng tại slide CẢM ƠN cuối bài' : ''}.`
      : `Bạn đã sẵn sàng (${pageCount} slide).`;
    const textNote = hasTextContent
      ? ` Ngoài ra bạn có NỘI DUNG TEXT đầy đủ của từng slide bên dưới — hãy dùng để thuyết trình chính xác.`
      : " Khi thuyết trình, đọc CHÍNH XÁC nội dung từ ảnh màn hình — không suy diễn thêm.";

    return {
      status: "ready",
      slide_count: pageCount,
      ...(outline ? { presentation_outline: outline } : {}),
      instruction:
        `${scanNote}${textNote}\n\n` +
        "══ NHIỆM VỤ DUY NHẤT NGAY BÂY GIỜ ══\n" +
        `Thông báo: 'Aura đã học xong bài thuyết trình gồm ${pageCount} slide. ` +
        "Sẵn sàng thuyết trình khi ông chủ ra lệnh BẮT ĐẦU THUYẾT TRÌNH!'\n\n" +
        "DỪNG HOÀN TOÀN. Không tự bắt đầu. Chờ lệnh từ user.",
    };
  }

  // ── START (Giai đoạn 2: Bắt đầu trình chiếu) ───────────────
  if (action === "start") {
    // Chặn gọi lại khi đang trình chiếu — tránh reset currentSlideIndex về 0
    const phaseAtStart = callbacks.onGetPresentationPhase?.();
    if (phaseAtStart === 'presenting') {
      console.log('[PresentationMode] action="start" BLOCKED — already presenting');
      return {
        status: "already_presenting",
        instruction:
          "Slideshow đang chạy rồi. KHÔNG gọi 'start' lại.\n" +
          "Chờ hệ thống tự gửi nội dung slide tiếp theo và thuyết trình.",
      };
    }

    callbacks.onNotification("📽️ Đang bật trình chiếu...");
    if (!platform.controlPresentation) {
      return { status: "error", error: "Không hỗ trợ điều khiển trình chiếu trên nền tảng này." };
    }

    const res = await platform.controlPresentation({ action: "start" }); // F5
    if (!res.success) {
      callbacks.onNotification(`⚠️ Lỗi bật slideshow: ${res.error}`);
      return { status: "error", error: res.error };
    }
    await new Promise(r => setTimeout(r, SLIDE_TRANSITION_DELAY_MS));

    // Bắt đầu ở slide 1
    callbacks.onSetCurrentSlideIndex?.(1);
    callbacks.onSetPresentationPhase?.('presenting');

    callbacks.onNotification("✅ Slideshow bật! Đang chụp slide 1...");
    await callbacks.onForceScreenCapture?.();
    await new Promise(r => setTimeout(r, 600));

    // Lấy slide 1 làm script khai mạc
    const allSlides = callbacks.onGetPresentationSlides?.() || [];
    const total = callbacks.onGetTotalSlides?.() || allSlides.length || '?';
    const slide1 = allSlides[0];
    const isOnlySlide = typeof total === 'number' && total === 1;

    // Kiểm tra slide 1 có phải slide cuối không (trường hợp bài 1 slide)
    let slide1IsEnd = false;
    if (slide1) {
      const uc = slide1.content.toUpperCase();
      slide1IsEnd = END_SLIDE_SIGNALS.some(s => uc.includes(s));
    }

    const scriptBlock = slide1
      ? `SCRIPT SLIDE 1:\n════════════════════\n${slide1.content}\n════════════════════`
      : `(Ảnh slide 1 đã được gửi — đọc nội dung từ màn hình)`;

    const instruction =
      `📽️ SLIDESHOW ĐÃ BẬT. Tổng: ${total} slide.\n\n` +
      `${scriptBlock}\n\n` +
      "BỐ CỤC KHAI MẠC (thực hiện đúng thứ tự, KHÔNG HỎI):\n" +
      "1. Lời chào ngắn gọn (1-2 câu)\n" +
      "2. Đọc nội dung slide 1 từ SCRIPT trên — chỉ dùng thông tin trong đó\n" +
      (isOnlySlide || slide1IsEnd
        ? "3. Khi xong: gọi control_presentation(action='end')"
        : "3. Khi xong: GỌI NGAY control_presentation(action='slide_done', slide_num=1)\n" +
          "   → Hệ thống sẽ gửi slide 2 ngay lập tức.\n\n" +
          "❌ KHÔNG hỏi 'qua slide tiếp nhé?'. ❌ KHÔNG chờ lệnh. GỌI NGAY slide_done=1.");

    return { status: "started", instruction };
  }

  // ── SLIDE_DONE (Confirm xong slide X → nhận script slide tiếp) ─
  if (action === "slide_done") {
    const confirmedSlide = (slideNum && slideNum > 0) ? Math.floor(slideNum) : (callbacks.onGetCurrentSlideIndex?.() ?? 1);
    const totalSlides = callbacks.onGetTotalSlides?.() ?? 0;

    callbacks.onNotification(`✅ Xong slide ${confirmedSlide} — đang chuyển...`);

    // Kiểm tra đã hết bài chưa
    if (totalSlides > 0 && confirmedSlide >= totalSlides) {
      callbacks.onSetPresentationPhase?.('idle');
      return {
        status: "presentation_complete",
        instruction:
          "Đã trình bày xong toàn bộ bài. Nói lời cảm ơn khán giả ngắn gọn.\n" +
          "Khi xong: gọi control_presentation(action='end'). KHÔNG HỎI.",
      };
    }

    // Lật sang slide tiếp theo
    if (!platform.controlPresentation) {
      return { status: "error", error: "Không hỗ trợ điều khiển trình chiếu." };
    }
    const nextRes = await platform.controlPresentation({ action: "next" });
    if (!nextRes.success) {
      // Có thể đã là slide cuối (slideshow thoát) — kết thúc
      callbacks.onSetPresentationPhase?.('idle');
      return {
        status: "presentation_complete",
        instruction:
          "Slideshow đã kết thúc. Nói lời cảm ơn khán giả.\n" +
          "Khi xong: gọi control_presentation(action='end').",
      };
    }

    await new Promise(r => setTimeout(r, SLIDE_TRANSITION_DELAY_MS)); // Chờ animation
    const nextSlideIdx = confirmedSlide + 1;
    callbacks.onSetCurrentSlideIndex?.(nextSlideIdx);

    // Chụp slide mới
    callbacks.onNotification(`📸 Đang chụp slide ${nextSlideIdx}...`);
    await callbacks.onForceScreenCapture?.();
    await new Promise(r => setTimeout(r, 500));

    // Lấy nội dung slide tiếp
    const allSlides = callbacks.onGetPresentationSlides?.() || [];
    const nextSlideData = allSlides[nextSlideIdx - 1]; // 0-indexed

    // Kiểm tra tín hiệu slide cuối
    const isLastSlide =
      (totalSlides > 0 && nextSlideIdx >= totalSlides) ||
      (nextSlideData
        ? END_SLIDE_SIGNALS.some(s => nextSlideData.content.toUpperCase().includes(s))
        : false);

    if (isLastSlide) {
      callbacks.onSetPresentationPhase?.('idle');
      callbacks.onNotification("✨ Slide cuối — kết thúc tự động");
    }

    callbacks.onNotification(`🎤 Slide ${nextSlideIdx}/${totalSlides || '?'} — gửi script...`);
    return {
      status: "next_slide",
      slide_num: nextSlideIdx,
      total: totalSlides || '?',
      instruction: buildSlideReadInstruction(nextSlideIdx, totalSlides || nextSlideIdx, nextSlideData, isLastSlide),
    };
  }

  // ── GOTO_MAIN (Nhảy đến slide nội dung chính) ──────────────
  if (action === "goto_main") {
    const targetSlide = (slideNum && slideNum > 0) ? Math.floor(slideNum) : 3;

    callbacks.onNotification(`⏩ Đang nhảy đến Slide ${targetSlide} (nội dung chính)...`);

    if (!platform.controlPresentation) {
      return { status: "error", error: "Không hỗ trợ điều khiển trình chiếu." };
    }

    const gotoRes = await platform.controlPresentation({
      action: "goto_slide",
      slide_num: targetSlide,
    });

    if (!gotoRes.success) {
      return { status: "error", error: gotoRes.error || "Không thể nhảy đến slide." };
    }

    await new Promise(r => setTimeout(r, SLIDE_TRANSITION_DELAY_MS));

    callbacks.onSetCurrentSlideIndex?.(targetSlide);
    callbacks.onSetPresentationPhase?.('presenting');

    // Chụp ảnh slide đích
    await callbacks.onForceScreenCapture?.();
    await new Promise(r => setTimeout(r, 500));

    const allSlides = callbacks.onGetPresentationSlides?.() || [];
    const slideData = allSlides[targetSlide - 1];
    const total = callbacks.onGetTotalSlides?.() || allSlides.length;
    const isLast =
      (total > 0 && targetSlide >= total) ||
      (slideData ? END_SLIDE_SIGNALS.some(s => slideData.content.toUpperCase().includes(s)) : false);

    return {
      status: "jumped",
      target_slide: targetSlide,
      instruction: buildSlideReadInstruction(targetSlide, total || targetSlide, slideData, isLast),
    };
  }

  // ── PAUSE AUTO (Q&A) ─────────────────────────────────────────
  if (action === "pause_auto") {
    callbacks.onNotification("⏸️ Tạm dừng Q&A...");
    callbacks.onSetPresentationPhase?.('paused_qa');
    return {
      status: "paused",
      instruction:
        "Đã tạm dừng. Trả lời câu hỏi từ khán giả.\n" +
        "Khi xong: gọi control_presentation(action='resume_auto').",
    };
  }

  // ── RESUME AUTO (sau Q&A) ─────────────────────────────────────
  if (action === "resume_auto") {
    callbacks.onNotification("▶️ Tiếp tục...");
    callbacks.onSetPresentationPhase?.('presenting');
    const currentIdx = callbacks.onGetCurrentSlideIndex?.() ?? 1;
    const allSlides = callbacks.onGetPresentationSlides?.() || [];
    const total = callbacks.onGetTotalSlides?.() || allSlides.length;
    const slideData = allSlides[currentIdx - 1];
    const isLast =
      (total > 0 && currentIdx >= total) ||
      (slideData ? END_SLIDE_SIGNALS.some(s => slideData.content.toUpperCase().includes(s)) : false);
    return {
      status: "resumed",
      instruction:
        `Đã tiếp tục từ slide ${currentIdx}.\n` +
        buildSlideReadInstruction(currentIdx, total || currentIdx, slideData, isLast),
    };
  }

  // ── END ───────────────────────────────────────────────────────
  if (action === "end") {
    callbacks.onNotification("⏹️ Đang kết thúc trình chiếu...");
    callbacks.onSetAutoPresenting?.(false);
    callbacks.onSetPresentationPhase?.('idle');

    if (platform.controlPresentation) {
      const res = await platform.controlPresentation({ action: "end" });
      callbacks.onToggleScreenVision?.(false);
      return res.success
        ? {
            status: "ended",
            instruction:
              "Slideshow đã tắt. Nói lời CẢM ƠN KHÁN GIẢ chân thành và tự nhiên. " +
              "Tóm tắt ngắn gọn những điểm chính của bài. Kết thúc hoàn chỉnh.",
          }
        : { status: "error", error: res.error };
    }

    callbacks.onToggleScreenVision?.(false);
    return {
      status: "ended",
      instruction: "Trình chiếu đã kết thúc. Cảm ơn khán giả và kết thúc tự nhiên.",
    };
  }

  // ── PREV (phụ trợ) ────────────────────────────────────────────
  if (action === "prev") {
    callbacks.onNotification("⏮️ Lùi slide...");
    if (!platform.controlPresentation) return { status: "error" };
    const res = await platform.controlPresentation({ action: "prev" });
    return res.success ? { status: "success", action } : { status: "error", error: res.error };
  }

  // ── NEXT (fallback phòng ngừa — AI TUYỆT ĐỐI không gọi khi đang presenting) ──────
  if (action === "next") {
    // Chặn hoàn toàn khi đang trong phase presenting — hệ thống tự lật slide
    const currentPhase = callbacks.onGetPresentationPhase?.();
    if (currentPhase === 'presenting') {
      console.log('[PresentationMode] action="next" BLOCKED during presenting phase');
      return {
        status: "blocked",
        instruction:
          "KHÔNG được gọi 'next' trong khi đang auto-presenting.\n" +
          "Hệ thống TỰ ĐỘNG lật slide sau khi bạn nói xong.\n" +
          "Tiếp tục thuyết trình nội dung slide hiện tại. Khi nói xong thì DỪNG — hệ thống tự chuyển.",
      };
    }
    callbacks.onNotification("⏭️ Sang slide tiếp theo...");
    if (!platform.controlPresentation) return { status: "error" };
    const res = await platform.controlPresentation({ action: "next" });
    if (!res.success) return { status: "error", error: res.error };
    await new Promise(r => setTimeout(r, SLIDE_TRANSITION_DELAY_MS));
    await callbacks.onForceScreenCapture?.();
    return {
      status: "ready",
      instruction: "Đã chuyển slide. Thuyết trình chính xác nội dung slide hiện tại — chỉ dùng thông tin đã được cung cấp.",
    };
  }

  return { status: "unknown_action", action };
}
