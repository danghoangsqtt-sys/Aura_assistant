/**
 * DocumentReader — Read PDF, DOCX, TXT files for Aura Desktop
 * Extracts plain text from common document formats.
 * Used by the `read_document` IPC handler.
 */
const fs = require('fs');
const path = require('path');

const MAX_TEXT_LENGTH = 15000; // ~15k chars to avoid flooding LLM context

/**
 * Read a document and return its text content
 * @param {string} filePath - Absolute path to the document
 * @returns {Promise<{success: boolean, text?: string, pageCount?: number, format?: string, truncated?: boolean, error?: string}>}
 */
async function readDocument(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, error: 'No file path provided' };
  }

  // Normalize path
  filePath = path.resolve(filePath.replace(/\//g, '\\').replace(/^["']+|["']+$/g, '').trim());

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File không tồn tại: ${filePath}` };
  }

  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  const stats = fs.statSync(filePath);

  // Safety: limit file size to 50MB
  if (stats.size > 50 * 1024 * 1024) {
    return { success: false, error: `File quá lớn (${(stats.size / 1024 / 1024).toFixed(1)}MB). Giới hạn: 50MB.` };
  }

  try {
    let result;

    switch (ext) {
      case '.pdf':
        result = await readPDF(filePath);
        break;
      case '.docx':
        result = await readDOCX(filePath);
        break;
      case '.doc':
        return { success: false, error: 'File .doc (cũ) không được hỗ trợ. Vui lòng chuyển sang .docx.' };
      case '.pptx':
        const pptxParser = require('./pptxParser.cjs');
        const pptxResult = pptxParser.parsePptx(filePath);
        if (pptxResult.success) {
          // Flatten slide content into text, marking slides clearly
          const text = pptxResult.slides.map(s => `[SLIDE ${s.slideNumber}]\n${s.content}\n${s.notes ? `[Ghi chú: ${s.notes}]` : ''}`).join('\n\n');
          result = { success: true, text, pageCount: pptxResult.totalSlides };
        } else {
          result = pptxResult;
        }
        break;
      case '.txt':
      case '.md':
      case '.csv':
      case '.log':
      case '.json':
      case '.xml':
      case '.html':
      case '.htm':
      case '.js':
      case '.ts':
      case '.py':
      case '.java':
      case '.c':
      case '.cpp':
      case '.css':
        result = readPlainText(filePath);
        break;
      default:
        return { success: false, error: `Định dạng file "${ext}" chưa được hỗ trợ. Hỗ trợ: PDF, DOCX, PPTX, TXT, MD, CSV, vv...` };
    }

    if (!result.success) return result;

    // Truncate if too long
    let truncated = false;
    let text = result.text || '';
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.substring(0, MAX_TEXT_LENGTH) + '\n\n... [NỘI DUNG ĐÃ BỊ CẮT NGẮN — File gốc dài hơn giới hạn 15,000 ký tự]';
      truncated = true;
    }

    return {
      success: true,
      text,
      fileName,
      format: ext.replace('.', '').toUpperCase(),
      pageCount: result.pageCount || null,
      charCount: text.length,
      truncated,
    };
  } catch (e) {
    console.error(`[DocumentReader] Error reading "${filePath}":`, e.message);
    return { success: false, error: `Lỗi đọc file: ${e.message}` };
  }
}

/**
 * Read PDF using pdf-parse
 */
async function readPDF(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);

    return {
      success: true,
      text: data.text || '',
      pageCount: data.numpages || 0,
    };
  } catch (e) {
    return { success: false, error: `PDF parse error: ${e.message}` };
  }
}

/**
 * Read DOCX using mammoth
 */
async function readDOCX(filePath) {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });

    return {
      success: true,
      text: result.value || '',
    };
  } catch (e) {
    return { success: false, error: `DOCX parse error: ${e.message}` };
  }
}

/**
 * Read plain text files
 */
function readPlainText(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return { success: true, text };
  } catch (e) {
    return { success: false, error: `Text read error: ${e.message}` };
  }
}

module.exports = { readDocument };
