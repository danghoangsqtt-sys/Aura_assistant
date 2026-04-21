/**
 * presentationService.ts — Aura Smart Presentation Knowledge Builder
 *
 * Desktop-only feature. Parses slide content extracted from PPTX/PDF
 * and stores a per-slide knowledge map for the current session.
 *
 * No external dependencies — uses the text already parsed by documentReader.cjs.
 */

export interface SlideKnowledge {
  slideNum: number;
  title: string;
  content: string;
  notes?: string;
  wordCount: number;
}

class PresentationService {
  private knowledgeMap = new Map<number, SlideKnowledge>();
  private _totalSlides = 0;
  private _fileName = '';

  /**
   * Load slide knowledge from raw text returned by documentReader (PPTX/PDF).
   * Expected format: "[SLIDE 1]\n content \n [Ghi chú: ...]" per slide block.
   * @returns number of slides parsed
   */
  loadFromText(rawText: string, fileName = ''): number {
    this.knowledgeMap.clear();
    this._fileName = fileName;

    // Split on [SLIDE N] markers
    const slideRegex = /\[SLIDE (\d+)\]/gi;
    const parts = rawText.split(slideRegex);

    // parts = ['', '1', 'content1', '2', 'content2', ...]
    let i = 1;
    while (i < parts.length - 1) {
      const num = parseInt(parts[i], 10);
      const rawContent = (parts[i + 1] || '').trim();

      if (isNaN(num) || !rawContent) { i += 2; continue; }

      // Extract notes if present
      const notesMatch = rawContent.match(/\[Ghi chú:\s*([\s\S]*?)\]$/);
      const notes = notesMatch ? notesMatch[1].trim() : undefined;
      const contentClean = rawContent.replace(/\[Ghi chú:[\s\S]*?\]$/, '').trim();

      // Extract first non-empty line as title
      const lines = contentClean.split('\n').map(l => l.trim()).filter(Boolean);
      const title = lines[0] || `Slide ${num}`;
      const body = lines.slice(1).join(' ');

      this.knowledgeMap.set(num, {
        slideNum: num,
        title,
        content: contentClean,
        notes,
        wordCount: contentClean.split(/\s+/).length,
      });

      i += 2;
    }

    this._totalSlides = this.knowledgeMap.size;
    console.log(`[PresentationService] Loaded ${this._totalSlides} slides from "${fileName}"`);
    return this._totalSlides;
  }

  getSlideKnowledge(slideNum: number): SlideKnowledge | null {
    return this.knowledgeMap.get(slideNum) ?? null;
  }

  get totalSlides(): number { return this._totalSlides; }
  get fileName(): string { return this._fileName; }
  get isLoaded(): boolean { return this._totalSlides > 0; }

  /**
   * Build a compact knowledge context string (≤3500 chars) for the presentation
   * system prompt. Includes all slide titles + fuller content for first 3 slides.
   */
  buildKnowledgeContext(): string {
    if (!this.isLoaded) return '';

    const lines: string[] = [`📄 TÀI LIỆU: ${this._fileName} (${this._totalSlides} slides)\n`];
    for (const [num, s] of this.knowledgeMap) {
      // Brief: title + first 120 chars of content
      const snippet = s.content.length > 120 ? s.content.slice(0, 120) + '...' : s.content;
      lines.push(`[Slide ${num}] ${s.title}: ${snippet}`);
    }

    const full = lines.join('\n');
    return full.length > 3500 ? full.slice(0, 3500) + '\n...[Còn nữa]' : full;
  }

  /**
   * Try to match OCR text to the closest slide using simple keyword overlap.
   * Returns best-match slideNum or null.
   */
  estimateCurrentSlide(ocrText: string): number | null {
    if (!this.isLoaded || !ocrText.trim()) return null;

    const ocrWords = new Set(
      ocrText.toLowerCase().split(/\W+/).filter(w => w.length > 3)
    );

    let bestSlide: number | null = null;
    let bestScore = 0;

    for (const [num, s] of this.knowledgeMap) {
      const slideWords = s.content.toLowerCase().split(/\W+/).filter(w => w.length > 3);
      const matches = slideWords.filter(w => ocrWords.has(w)).length;
      const score = matches / Math.max(slideWords.length, 1);
      if (score > bestScore && score > 0.15) {
        bestScore = score;
        bestSlide = num;
      }
    }

    return bestSlide;
  }

  clear() {
    this.knowledgeMap.clear();
    this._totalSlides = 0;
    this._fileName = '';
  }
}

// Singleton — Desktop-only (not imported in webapp)
export const presentationService = new PresentationService();
