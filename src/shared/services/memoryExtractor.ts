/**
 * MemoryExtractor — Automatically extract key facts from chat history
 * Runs after each session ends to populate long-term memory.
 */

import { ChatMessage } from '../types';
import { memoryService, Memory } from './memoryService';

// Patterns that indicate extractable facts
const FACT_PATTERNS = [
  // User introduces themselves or mentions names
  { regex: /(?:tên|name|gọi|call)\s+(?:tôi|em|mình|tao|me|I'm|I am)\s+(?:là|is|:)?\s*([A-ZÀ-ỹ][\wÀ-ỹ\s]{1,30})/i, category: 'fact' as const, importance: 5, template: (m: RegExpMatchArray) => `Tên người dùng: ${m[1].trim()}` },
  // Preferences — require more context words to avoid false positives (BUG-L02 FIX)
  { regex: /(?:rất\s+thích|yêu\s+thích|sở\s+thích|love|really\s+like|enjoy\s+doing)\s+(.{5,60})/i, category: 'preference' as const, importance: 3, template: (m: RegExpMatchArray) => `Sở thích: ${m[1].trim()}` },
  // Occupation/job
  { regex: /(?:làm\s+(?:nghề|việc|job)|work\s+as|nghề\s+(?:nghiệp|là)|occupation)\s*:?\s*(.{3,60})/i, category: 'fact' as const, importance: 4, template: (m: RegExpMatchArray) => `Nghề nghiệp: ${m[1].trim()}` },
  // Age
  { regex: /(?:tuổi|age|years?\s+old)\s*:?\s*(\d{1,3})/i, category: 'fact' as const, importance: 4, template: (m: RegExpMatchArray) => `Tuổi: ${m[1]}` },
  // Plans/schedule
  { regex: /(?:mai|ngày mai|tomorrow|tuần tới|next week)\s+(.{5,80})/i, category: 'event' as const, importance: 3, template: (m: RegExpMatchArray) => `Kế hoạch: ${m[1].trim()}` },
  // Location
  { regex: /(?:sống|ở|live\s+in|location|from|đến\s+từ)\s+(?:tại|ở|in)?\s*([A-ZÀ-ỹ][\wÀ-ỹ\s,]{2,40})/i, category: 'fact' as const, importance: 4, template: (m: RegExpMatchArray) => `Nơi ở: ${m[1].trim()}` },
  // Projects
  { regex: /(?:dự\s+án|project|đang\s+làm|working\s+on)\s+(.{3,60})/i, category: 'event' as const, importance: 3, template: (m: RegExpMatchArray) => `Đang làm: ${m[1].trim()}` },
];

/**
 * Extract and save memories from a chat session
 */
export function extractAndSaveMemories(messages: ChatMessage[]): Memory[] {
  const userMessages = messages.filter(m => m.role === 'user');
  const extracted: Memory[] = [];

  for (const msg of userMessages) {
    const text = msg.text;
    if (text.length < 5) continue; // Skip very short messages

    for (const pattern of FACT_PATTERNS) {
      const match = text.match(pattern.regex);
      if (match) {
        try {
          const content = pattern.template(match);
          if (content.length > 5 && content.length < 200) {
            const memory = memoryService.addMemory(pattern.category, content, pattern.importance);
            extracted.push(memory);
          }
        } catch {
          // Pattern match failed, skip
        }
      }
    }
  }

  // Also save a session summary if there were enough messages
  if (messages.length >= 4) {
    const userTexts = userMessages.slice(0, 3).map(m => m.text.slice(0, 50)).join(', ');
    const sessionDate = new Date().toLocaleDateString('vi-VN');
    memoryService.addMemory('event', `[${sessionDate}] Đã trò chuyện về: ${userTexts}`, 2);
  }

  console.log(`[MemoryExtractor] Extracted ${extracted.length} new memories from ${messages.length} messages.`);
  return extracted;
}
