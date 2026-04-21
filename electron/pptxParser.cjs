/**
 * PPTX Parser — Extract slide-by-slide text content from PowerPoint files
 * 
 * PPTX = ZIP archive containing XML slides at ppt/slides/slide{N}.xml
 * Each slide's text is in <a:t> tags within the XML.
 * 
 * Used by Presentation Mode to pre-read ALL slide content BEFORE presenting,
 * so Aura has accurate text and never needs to fabricate content from screenshots.
 */
const AdmZip = require('adm-zip');
const path = require('path');

/**
 * Parse a PPTX file and extract text content from each slide.
 * @param {string} filePath - Absolute path to the .pptx file
 * @returns {{ success: boolean, totalSlides?: number, slides?: Array<{slideNumber: number, content: string}>, error?: string }}
 */
function parsePptx(filePath) {
  try {
    const zip = new AdmZip(filePath);
    const slides = [];

    // Get all slide XML entries, sorted by slide number
    const slideEntries = zip.getEntries()
      .filter(e => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/slide(\d+)/i)[1]);
        const numB = parseInt(b.entryName.match(/slide(\d+)/i)[1]);
        return numA - numB;
      });

    if (slideEntries.length === 0) {
      return { success: false, error: 'Không tìm thấy slide nào trong file PPTX.' };
    }

    for (const entry of slideEntries) {
      const xml = entry.getData().toString('utf8');
      const slideNum = parseInt(entry.entryName.match(/slide(\d+)/i)[1]);

      // Extract all text from <a:t> tags
      const texts = [];
      const regex = /<a:t>([^<]*)<\/a:t>/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        const text = match[1].trim();
        if (text) texts.push(text);
      }

      // Join with spaces, collapse multiple spaces
      const content = texts.join(' ').replace(/\s+/g, ' ').trim();

      slides.push({
        slideNumber: slideNum,
        content: content || '(Slide trống — chỉ có hình ảnh)',
      });
    }

    // Also try to read slide notes (ppt/notesSlides/notesSlide{N}.xml)
    for (const slide of slides) {
      try {
        const notesEntry = zip.getEntry(`ppt/notesSlides/notesSlide${slide.slideNumber}.xml`);
        if (notesEntry) {
          const notesXml = notesEntry.getData().toString('utf8');
          const noteTexts = [];
          const noteRegex = /<a:t>([^<]*)<\/a:t>/g;
          let noteMatch;
          while ((noteMatch = noteRegex.exec(notesXml)) !== null) {
            const t = noteMatch[1].trim();
            // Filter out common auto-generated text in notes
            if (t && t !== String(slide.slideNumber) && !t.match(/^\d+$/)) {
              noteTexts.push(t);
            }
          }
          const notes = noteTexts.join(' ').replace(/\s+/g, ' ').trim();
          if (notes) {
            slide.notes = notes;
          }
        }
      } catch (e) {
        // Notes are optional, ignore errors
      }
    }

    console.log(`[PptxParser] Parsed ${slides.length} slides from ${path.basename(filePath)}`);
    return {
      success: true,
      totalSlides: slides.length,
      slides,
    };
  } catch (e) {
    console.error(`[PptxParser] Error parsing "${filePath}":`, e.message);
    return { success: false, error: `PPTX parse error: ${e.message}` };
  }
}

module.exports = { parsePptx };
