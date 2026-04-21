/**
 * DocumentPanel.tsx — Aura Document Viewer
 *
 * Premium overlay panel for viewing AI-generated documents:
 * - Plans, Emails, Content Drafts, Spreadsheets
 * - Markdown rendering with tables support
 * - Copy, Download (MD/CSV), Edit toggle
 * - Slide-in animation, glassmorphism design
 *
 * Shared component — works on both Web and Desktop.
 * Does NOT interrupt audio pipeline.
 */

import React, { useState, useRef, useCallback } from 'react';
import { X, Copy, Download, Edit3, Check, FileText, Mail, Table, ClipboardList } from 'lucide-react';
import { GeneratedDocument, DocumentType } from '../types';

// ── Markdown → HTML simple renderer (no heavy deps) ──────────
// Uses a lightweight approach to avoid pulling in large packages.
// Supports: headers, bold, italic, lists, tables, code blocks.
function renderMarkdown(md: string): string {
  let html = md
    // Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:12px;overflow-x:auto;font-size:13px;margin:8px 0"><code>$1</code></pre>')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 style="font-size:14px;font-weight:700;margin:16px 0 6px;color:#e2e8f0">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;margin:18px 0 8px;color:#e2e8f0">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:17px;font-weight:700;margin:20px 0 10px;color:#f1f5f9;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:800;margin:20px 0 12px;color:#f8fafc">$1</h1>')
    // Bold & italic
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li style="margin:3px 0;padding-left:4px">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:3px 0;padding-left:4px;list-style-type:decimal">$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr style="border:0;border-top:1px solid rgba(255,255,255,0.1);margin:16px 0"/>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((<li[^>]*>.*?<\/li>\s*<br\/>?\s*)+)/g, (match) => {
    const items = match.replace(/<br\/?>/g, '');
    return `<ul style="padding-left:20px;margin:8px 0">${items}</ul>`;
  });

  // Markdown tables → HTML tables
  const tableRegex = /(\|.+\|\s*<br\/?>\s*\|[-| :]+\|\s*<br\/?>(\s*\|.+\|\s*<br\/?>?)*)/g;
  html = html.replace(tableRegex, (tableBlock) => {
    const rows = tableBlock
      .split(/<br\/?>/g)
      .map(r => r.trim())
      .filter(r => r.startsWith('|') && !r.match(/^\|[\s\-:|]+\|$/));

    if (rows.length === 0) return tableBlock;

    const parseRow = (row: string, isHeader: boolean) => {
      const cells = row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim());
      const tag = isHeader ? 'th' : 'td';
      const style = isHeader
        ? 'padding:8px 12px;text-align:left;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#a78bfa;border-bottom:2px solid rgba(167,139,250,0.3);background:rgba(167,139,250,0.08)'
        : 'padding:8px 12px;text-align:left;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);color:#cbd5e1';
      return `<tr>${cells.map(c => `<${tag} style="${style}">${c}</${tag}>`).join('')}</tr>`;
    };

    const headerRow = parseRow(rows[0], true);
    const bodyRows = rows.slice(1).map(r => parseRow(r, false)).join('');
    return `<div style="overflow-x:auto;margin:12px 0;border-radius:12px;border:1px solid rgba(255,255,255,0.08)"><table style="width:100%;border-collapse:collapse;font-family:inherit">${headerRow}${bodyRows}</table></div>`;
  });

  return html;
}

// ── Excel XML export from Markdown tables ─────────────────────────
function markdownToExcelXML(md: string, title: string): string {
  const lines = md.split('\n');
  const tableRows: string[][] = [];
  const nonTableLines: string[] = [];

  // Extract table rows and non-table content
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && !trimmed.match(/^\|[\s\-:|]+\|$/)) {
      const cells = trimmed.split('|')
        .filter((_, i, arr) => i > 0 && i < arr.length - 1)
        .map(c => c.trim().replace(/\*\*/g, '')); // strip markdown bold
      tableRows.push(cells);
    } else if (trimmed && !trimmed.startsWith('|')) {
      // Collect non-table content (title, notes, etc)
      const clean = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/\*/g, '');
      if (clean) nonTableLines.push(clean);
    }
  }

  // Determine column count
  const maxCols = Math.max(...tableRows.map(r => r.length), 1);

  // Build Excel XML Spreadsheet 2003 format
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="11"/></Style>
    <Style ss:ID="Title"><Font ss:FontName="Arial" ss:Size="14" ss:Bold="1" ss:Color="#1a1a2e"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Interior ss:Color="#f0f4ff" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Header"><Font ss:FontName="Arial" ss:Size="11" ss:Bold="1" ss:Color="#ffffff"/><Alignment ss:Vertical="Center" ss:WrapText="1"/><Interior ss:Color="#4a6cf7" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#3451b2"/></Borders></Style>
    <Style ss:ID="Bold"><Font ss:FontName="Arial" ss:Size="11" ss:Bold="1"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
    <Style ss:ID="Note"><Font ss:FontName="Arial" ss:Size="10" ss:Italic="1" ss:Color="#666666"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
    <Style ss:ID="Cell"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="11"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e0e0e0"/></Borders></Style>
    <Style ss:ID="TotalRow"><Font ss:FontName="Arial" ss:Size="11" ss:Bold="1" ss:Color="#1a1a2e"/><Alignment ss:Vertical="Top" ss:WrapText="1"/><Interior ss:Color="#fff3e0" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#ff9800"/></Borders></Style>
  </Styles>
  <Worksheet ss:Name="${escapeXML(title.substring(0, 31))}">
    <Table ss:DefaultColumnWidth="120" ss:DefaultRowHeight="20">`;

  // Column widths 
  for (let i = 0; i < maxCols; i++) {
    const width = i === 0 ? 200 : 150;
    xml += `\n      <Column ss:Width="${width}"/>`;
  }

  // Title row (merged across all columns)
  xml += `\n      <Row ss:Height="30">
        <Cell ss:StyleID="Title" ss:MergeAcross="${maxCols - 1}"><Data ss:Type="String">${escapeXML(title)}</Data></Cell>
      </Row>`;

  // Non-table content as note rows (before table)
  for (const note of nonTableLines.slice(0, 3)) {
    xml += `\n      <Row>
        <Cell ss:StyleID="Note" ss:MergeAcross="${maxCols - 1}"><Data ss:Type="String">${escapeXML(note)}</Data></Cell>
      </Row>`;
  }

  // Empty separator row
  if (nonTableLines.length > 0 && tableRows.length > 0) {
    xml += `\n      <Row ss:Height="10"><Cell><Data ss:Type="String"></Data></Cell></Row>`;
  }

  // Table data
  tableRows.forEach((row, rowIndex) => {
    const isHeader = rowIndex === 0;
    const isTotal = row.some(c => c.toLowerCase().includes('tổng') || c.toLowerCase().includes('total'));
    const styleId = isHeader ? 'Header' : isTotal ? 'TotalRow' : 'Cell';

    xml += `\n      <Row${isHeader ? ' ss:Height="25"' : ''}>`;
    for (let i = 0; i < maxCols; i++) {
      const cellValue = row[i] || '';
      xml += `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXML(cellValue)}</Data></Cell>`;
    }
    xml += `</Row>`;
  });

  // Remaining non-table notes at the bottom
  if (nonTableLines.length > 3) {
    xml += `\n      <Row ss:Height="10"><Cell><Data ss:Type="String"></Data></Cell></Row>`;
    for (const note of nonTableLines.slice(3)) {
      xml += `\n      <Row>
        <Cell ss:StyleID="Note" ss:MergeAcross="${maxCols - 1}"><Data ss:Type="String">${escapeXML(note)}</Data></Cell>
      </Row>`;
    }
  }

  xml += `\n    </Table>
  </Worksheet>
</Workbook>`;

  return xml;
}

function escapeXML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ── Convert Markdown to formatted HTML for non-spreadsheet downloads ──
function markdownToHTML(md: string, title: string, docType: string): string {
  const renderedBody = renderMarkdown(md);
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1a1a2e; line-height: 1.7; }
    h1 { font-size: 22px; border-bottom: 2px solid #4a6cf7; padding-bottom: 8px; color: #1a1a2e; }
    h2 { font-size: 18px; margin-top: 24px; color: #2d3748; }
    h3 { font-size: 16px; color: #4a5568; }
    strong { color: #1a1a2e; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #4a6cf7; color: white; font-weight: 700; text-align: left; padding: 10px 14px; font-size: 13px; }
    td { padding: 8px 14px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    tr:nth-child(even) { background: #f7fafc; }
    ul, ol { padding-left: 24px; }
    li { margin: 4px 0; }
    pre { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; overflow-x: auto; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
    .doc-type { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #4a6cf7; color: white; padding: 3px 10px; border-radius: 12px; margin-bottom: 12px; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <span class="doc-type">${docType}</span>
  ${renderedBody}
</body>
</html>`;
}

// ── Doc type config ─────────────────────────────────────────
const DOC_TYPE_CONFIG: Record<DocumentType, { icon: React.ReactNode; label: string; color: string; bgGlow: string }> = {
  plan: {
    icon: <ClipboardList size={18} />,
    label: 'Kế hoạch',
    color: '#a78bfa',
    bgGlow: 'rgba(167, 139, 250, 0.15)',
  },
  email: {
    icon: <Mail size={18} />,
    label: 'Email',
    color: '#38bdf8',
    bgGlow: 'rgba(56, 189, 248, 0.15)',
  },
  content: {
    icon: <FileText size={18} />,
    label: 'Nội dung',
    color: '#34d399',
    bgGlow: 'rgba(52, 211, 153, 0.15)',
  },
  spreadsheet: {
    icon: <Table size={18} />,
    label: 'Bảng tính',
    color: '#fb923c',
    bgGlow: 'rgba(251, 146, 60, 0.15)',
  },
};

interface DocumentPanelProps {
  document: GeneratedDocument;
  onClose: () => void;
}

const DocumentPanel: React.FC<DocumentPanelProps> = ({ document, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(document.content);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const config = DOC_TYPE_CONFIG[document.type] || DOC_TYPE_CONFIG.content;
  const displayContent = isEditing ? editContent : document.content;

  // ── Copy to clipboard ────────────────────────────────────
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = window.document.createElement('textarea');
      ta.value = displayContent;
      window.document.body.appendChild(ta);
      ta.select();
      window.document.execCommand('copy');
      window.document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [displayContent]);

  // ── Download file ──────────────────────────────────────
  const handleDownload = useCallback(() => {
    let content: string;
    let filename: string;
    let mimeType: string;
    const safeTitle = document.title.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF\s]/g, '_').replace(/\s+/g, '_');

    if (document.type === 'spreadsheet') {
      // Export as Excel XML Spreadsheet (opens natively in Excel with formatting)
      content = markdownToExcelXML(displayContent, document.title);
      filename = `${safeTitle}.xls`;
      mimeType = 'application/vnd.ms-excel';
    } else if (document.type === 'email') {
      // For email: open mailto link if we have 'to'
      if (document.metadata?.to) {
        const subject = encodeURIComponent(document.metadata?.subject || document.title);
        const body = encodeURIComponent(displayContent.replace(/[#*_~`]/g, ''));
        window.open(`mailto:${document.metadata.to}?subject=${subject}&body=${body}`, '_self');
        return;
      }
      // Export email as formatted HTML
      content = markdownToHTML(displayContent, document.title, 'Email');
      filename = `${safeTitle}.html`;
      mimeType = 'text/html;charset=utf-8';
    } else {
      // Export plan/content as formatted HTML
      const docTypeLabel = document.type === 'plan' ? 'Kế hoạch' : 'Tài liệu';
      content = markdownToHTML(displayContent, document.title, docTypeLabel);
      filename = `${safeTitle}.html`;
      mimeType = 'text/html;charset=utf-8';
    }

    const blob = new Blob(['\uFEFF' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = filename;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [displayContent, document]);

  // ── Toggle edit mode ─────────────────────────────────────
  const handleToggleEdit = useCallback(() => {
    if (isEditing) {
      // Save edits
      setIsEditing(false);
    } else {
      setEditContent(document.content);
      setIsEditing(true);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isEditing, document.content]);

  // ── Format timestamp ─────────────────────────────────────
  const timeStr = new Date(document.createdAt).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit'
  });

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ animation: 'docPanelFadeIn 0.3s ease-out' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(15,15,25,0.97) 0%, rgba(20,20,35,0.98) 100%)',
          border: `1px solid ${config.color}25`,
          boxShadow: `0 30px 80px rgba(0,0,0,0.7), 0 0 80px ${config.bgGlow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
          animation: 'docPanelSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3 min-w-0">
            {/* Type badge */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: config.bgGlow, color: config.color }}
            >
              {config.icon}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate">{document.title}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{ background: config.bgGlow, color: config.color }}
                >
                  {config.label}
                </span>
                <span className="text-[10px] text-white/30">{timeStr}</span>
                {document.metadata?.to && (
                  <span className="text-[10px] text-white/40">→ {document.metadata.to}</span>
                )}
              </div>
            </div>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Content ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
          {/* Email header info */}
          {document.type === 'email' && (document.metadata?.to || document.metadata?.subject) && (
            <div className="mb-4 p-3 rounded-xl bg-white/3 border border-white/5 space-y-1.5">
              {document.metadata?.to && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/40 font-medium w-16">Đến:</span>
                  <span className="text-sky-300">{document.metadata.to}</span>
                </div>
              )}
              {document.metadata?.subject && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/40 font-medium w-16">Tiêu đề:</span>
                  <span className="text-white/80 font-medium">{document.metadata.subject}</span>
                </div>
              )}
            </div>
          )}

          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full min-h-[300px] bg-white/3 border border-white/10 rounded-xl p-4 text-sm text-white/90 font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/40 transition-all"
              style={{ caretColor: config.color }}
              spellCheck={false}
            />
          ) : (
            <div
              className="prose prose-invert max-w-none text-sm text-white/80 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(displayContent) }}
            />
          )}
        </div>

        {/* ── Action Bar ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/5 bg-black/20">
          <div className="flex items-center gap-2">
            {/* Copy */}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/5 hover:border-white/10"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              {copied ? 'Đã copy!' : 'Copy'}
            </button>

            {/* Download */}
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/5 hover:border-white/10"
            >
              <Download size={14} />
              {document.type === 'spreadsheet' ? 'Tải Excel' : document.type === 'email' && document.metadata?.to ? 'Gửi Email' : 'Tải về'}
            </button>

            {/* Edit toggle */}
            <button
              onClick={handleToggleEdit}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                isEditing
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25'
                  : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border-white/5 hover:border-white/10'
              }`}
            >
              <Edit3 size={14} />
              {isEditing ? 'Xong' : 'Chỉnh sửa'}
            </button>
          </div>

          {/* Word count */}
          <span className="text-[10px] text-white/20 font-mono">
            {displayContent.split(/\s+/).filter(Boolean).length} từ
          </span>
        </div>
      </div>

      {/* ── Animations ───────────────────────────────────── */}
      <style>{`
        @keyframes docPanelFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes docPanelSlideIn {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default DocumentPanel;
