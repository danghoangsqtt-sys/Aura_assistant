import { UserSettings, GeneratedDocument, MeetingNoteEntry, MeetingNoteType } from "../types";
import { memoryService } from "./memoryService";
import { handlePresentationToolCall } from "./presentationMode";
import { platform } from "../platformBridge";

export interface ToolCallbacks {
  onOpenUrl: (url: string) => void;
  onNotification: (msg: string) => void;
  onDeepSleepCommand: () => void;
  onExitDeepSleepCommand?: () => void;
  onOpenSettingsCommand: () => void;
  onCloseSettingsCommand: () => void;
  onToggleMute?: (mute: boolean) => void;
  onToggleScreenVision?: (enable: boolean) => void;
  onToggleCameraVision?: (enable: boolean) => void;
  onForceScreenCapture?: () => Promise<void>;
  onToggleMeetingMode?: (enable: boolean) => void;
  onSetAutoPresenting?: (enable: boolean) => void;
  onGetPresentationFilePath?: () => string | undefined;
  onSetPresentationPhase?: (phase: string) => void;
  onGetPresentationPhase?: () => string;
  onPresentationRead?: (text: string, pageCount: number) => void;
  onSetCurrentSlideIndex?: (idx: number) => void;
  onGetCurrentSlideIndex?: () => number;
  onGetPresentationSlides?: () => { slideNum: number; content: string }[];
  onSetScannedSlideCount?: (count: number) => void;
  onGetTotalSlides?: () => number;
  onClearChat?: () => void;
  onChangeBackground?: (bgName: string) => void;
  onCloseBrowserTabs?: (options: any) => Promise<{ success: boolean, handled: number, error?: string }>;
  onDocumentGenerated?: (doc: GeneratedDocument) => void;
  onMeetingNoteUpdate?: (note: MeetingNoteEntry) => void;
  onSearchFiles?: (options: any) => Promise<{ success: boolean, results: any[], totalFound?: number, error?: string }>;
  onOpenPath?: (options: any) => Promise<{ success: boolean, action?: string, note?: string, error?: string }>;
  onCloseFolderWindow?: (options: any) => Promise<{ success: boolean, closed: number, error?: string }>;
  onReminderTriggered?: (label: string) => void;
}

export async function findRelevantParagraphs(query: string, context: string, maxResults = 3): Promise<string[]> {
  const normalizedQuery = query.toLowerCase().trim();
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const paragraphs = context
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  // Yield back to main thread to prevent UI freezing on huge files
  await new Promise(resolve => setTimeout(resolve, 0));

  const scored = paragraphs
    .map((paragraph) => {
      const lower = paragraph.toLowerCase();
      let score = 0;

      if (normalizedQuery && lower.includes(normalizedQuery)) {
        score += normalizedQuery.length * 2;
      }

      for (const token of queryTokens) {
        if (token.length < 2) continue;
        if (lower.includes(token)) score += token.length;
      }

      return { paragraph, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored.map(item => item.paragraph);
}

export async function handleToolCall(
  toolCall: any,
  callbacks: ToolCallbacks,
  settings: UserSettings | null,
  reminderTimers: Map<string, ReturnType<typeof setTimeout>>,
  sendResponseCallback: (fc: any, result: any) => void
) {
  for (const fc of toolCall.functionCalls) {
    console.log("Tool Call:", fc.name, fc.args);
    let result: any = { status: "ok" };

    // --- MEDIA & SEARCH: Auto-open in default browser (no popup overlay) ---
    if (fc.name === 'play_youtube_video') {
      const query = (fc.args.search_query || "").toString().trim();
      callbacks.onOpenUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
      callbacks.onNotification(`▶️ Đang mở YouTube: ${query}`);
      result = { status: "success", info: "YouTube opened in user browser. Tell user 'I have opened YouTube for you'." };
    }
    else if (fc.name === 'play_music') {
      const query = (fc.args.search_query || "").toString().trim();
      callbacks.onOpenUrl(`https://zingmp3.vn/tim-kiem/tat-ca?q=${encodeURIComponent(query)}`);
      callbacks.onNotification(`🎵 Đang mở Zing MP3: ${query}`);
      result = { status: "success", info: "Music opened in user browser. Tell user 'I have opened Zing MP3 for you'." };
    }
    else if (fc.name === 'open_google_search') {
      const query = (fc.args.query || "").toString().trim();
      callbacks.onOpenUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
      callbacks.onNotification(`🔍 Đang mở Google Search: ${query}`);
      result = { status: "success", info: "Google search tab opened in the user's browser. You CANNOT see the results. DO NOT call this tool again. Tell the user you opened a Google search tab for them." };
    }
    else if (fc.name === 'open_url') {
      let url = (fc.args.url || "").toString().trim();
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        // AI might just send 'facebook', so let's make it a valid domain guess if it doesn't have a dot
        if (!url.includes('.')) url += '.com';
        url = 'https://' + url;
      }
      callbacks.onOpenUrl(url);
      callbacks.onNotification(`🌐 Đang mở: ${url}`);
      result = { status: "success", info: `Website ${url} opened in user's browser. Tell the user you have opened it for them.` };
    }
    else if (fc.name === 'enter_deep_sleep') {
      callbacks.onDeepSleepCommand();
      result = { status: "entering_sleep_mode" };
    }
    else if (fc.name === 'exit_deep_sleep') {
      if (callbacks.onExitDeepSleepCommand) callbacks.onExitDeepSleepCommand();
      result = { status: "exiting_sleep_mode" };
    }
    else if (fc.name === 'control_presentation') {
      const action = (fc.args.action || "next").toString();
      const slideNum = fc.args.slide_num ? Number(fc.args.slide_num) : undefined;
      result = await handlePresentationToolCall(action, slideNum, {
        onToggleScreenVision: callbacks.onToggleScreenVision,
        onNotification: callbacks.onNotification,
        onForceScreenCapture: callbacks.onForceScreenCapture,
        onSetAutoPresenting: callbacks.onSetAutoPresenting,
        onGetPresentationFilePath: callbacks.onGetPresentationFilePath,
        onSetPresentationPhase: callbacks.onSetPresentationPhase as any,
        onGetPresentationPhase: callbacks.onGetPresentationPhase as any,
        onPresentationRead: callbacks.onPresentationRead,
        onSetCurrentSlideIndex: callbacks.onSetCurrentSlideIndex,
        onGetCurrentSlideIndex: callbacks.onGetCurrentSlideIndex,
        onGetPresentationSlides: callbacks.onGetPresentationSlides,
        onSetScannedSlideCount: callbacks.onSetScannedSlideCount,
        onGetTotalSlides: callbacks.onGetTotalSlides,
      });
    }
    else if (fc.name === 'open_settings') {
      callbacks.onOpenSettingsCommand();
      result = { status: "success", info: "Settings opened. DO NOT call open_settings again." };
    }
    else if (fc.name === 'close_settings') {
      callbacks.onCloseSettingsCommand();
      result = { status: "success", info: "Settings closed." };
    }
    else if (fc.name === 'toggle_mute') {
      const mute = fc.args.mute === true;
      if (callbacks.onToggleMute) callbacks.onToggleMute(mute);
      result = { status: "success", action: mute ? "muted" : "unmuted" };
    }
    else if (fc.name === 'toggle_screen_vision') {
      const enable = fc.args.enable === true;
      if (callbacks.onToggleScreenVision) callbacks.onToggleScreenVision(enable);
      result = { status: "success", action: enable ? "screen_vision_enabled" : "screen_vision_disabled" };
    }
    else if (fc.name === 'toggle_camera_vision') {
      const enable = fc.args.enable === true;
      if (callbacks.onToggleCameraVision) callbacks.onToggleCameraVision(enable);
      result = { status: "success", action: enable ? "camera_vision_enabled" : "camera_vision_disabled" };
    }
    else if (fc.name === 'toggle_meeting_mode') {
      const enable = fc.args.enable === true;
      if (callbacks.onToggleMeetingMode) callbacks.onToggleMeetingMode(enable);
      result = { status: "success", action: enable ? "meeting_mode_enabled" : "meeting_mode_disabled" };
    }
    else if (fc.name === 'clear_chat') {
      if (callbacks.onClearChat) callbacks.onClearChat();
      result = { status: "success", action: "chat_cleared" };
    }
    else if (fc.name === 'change_background') {
      const bg = (fc.args.bg_name || "").toString();
      if (callbacks.onChangeBackground) callbacks.onChangeBackground(bg);
      result = { status: "success", action: `background_changed_to_${bg}` };
    }
    else if (fc.name === 'close_browser_tabs') {
      if (callbacks.onCloseBrowserTabs) {
        callbacks.onNotification(`Đang quét các thẻ trình duyệt...`);
        const res = await callbacks.onCloseBrowserTabs(fc.args);
        if (res.success) {
          result = { status: "success", tabs_closed: res.handled };
          callbacks.onNotification(`Đã đóng ${res.handled} thẻ trình duyệt`);
        } else {
          result = { status: "error", error: res.error };
        }
      } else {
        result = { status: "not_supported", error: "Platform does not support closing tabs" };
      }
    }
    else if (fc.name === 'set_reminder') {
      const label = (fc.args.label || "Reminder").toString().trim();
      const delayMinutes = fc.args.delay_minutes ? Number(fc.args.delay_minutes) : undefined;
      const cronExpression = fc.args.cron_expression ? fc.args.cron_expression.toString().trim() : undefined;
      const repeat = fc.args.repeat === true;

      if (!delayMinutes && !cronExpression) {
        // Fallback: use old setTimeout for simple delay without platform support
        const fallbackDelay = 5;
        const delayMs = fallbackDelay * 60 * 1000;
        const reminderId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const timerId = setTimeout(() => {
          reminderTimers.delete(reminderId);
          callbacks.onNotification(`⏰ Nhắc nhở: ${label}`);
        }, delayMs);
        reminderTimers.set(reminderId, timerId);
        result = { status: "reminder_set", reminderId, label, info: `Simple reminder set for ${fallbackDelay} minutes.` };
      } else if (platform.isElectron) {
        // Use persistent CronManager via platformBridge
        const res = await platform.scheduleTask({
          label,
          delayMinutes,
          cronExpression,
          repeat,
        });
        if (res.success) {
          const typeInfo = cronExpression ? `cron: ${cronExpression}` : `sau ${delayMinutes} phút`;
          callbacks.onNotification(`⏰ Đã đặt nhắc nhở: "${label}" (${typeInfo})`);
          result = { status: "reminder_set", task: res.task, info: `Reminder "${label}" scheduled successfully (${typeInfo}). Confirm to user.` };
        } else {
          result = { status: "error", error: res.error };
        }
      } else {
        // Web fallback — simple setTimeout
        if (delayMinutes && delayMinutes > 0) {
          const delayMs = Math.round(delayMinutes * 60 * 1000);
          const reminderId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const timerId = setTimeout(() => {
            reminderTimers.delete(reminderId);
            callbacks.onNotification(`⏰ Nhắc nhở: ${label}`);
          }, delayMs);
          reminderTimers.set(reminderId, timerId);
          result = { status: "reminder_set", reminderId, label };
        } else {
          result = { status: "error", error: "Cron scheduling chỉ hỗ trợ trên Desktop App." };
        }
      }
    }
    else if (fc.name === 'cancel_reminder') {
      const reminderId = (fc.args.reminder_id || '').toString().trim();
      if (!reminderId) {
        result = { status: 'error', error: 'Cần cung cấp ID của nhắc nhở.' };
      } else if (platform.isElectron) {
        const res = await platform.cancelTask(reminderId);
        if (res.success) {
          callbacks.onNotification(`✅ Đã hủy nhắc nhở`);
          result = { status: 'success', info: 'Reminder cancelled. Confirm to user.' };
        } else {
          result = { status: 'error', error: res.error };
        }
      } else {
        // Web fallback: try clearing from reminderTimers map
        if (reminderTimers.has(reminderId)) {
          clearTimeout(reminderTimers.get(reminderId)!);
          reminderTimers.delete(reminderId);
          result = { status: 'success', info: 'Reminder cancelled.' };
        } else {
          result = { status: 'not_found', error: 'Không tìm thấy nhắc nhở với ID này.' };
        }
      }
    }
    else if (fc.name === 'list_reminders') {
      if (platform.isElectron) {
        const res = await platform.listTasks();
        if (res.success && res.tasks.length > 0) {
          const formatted = res.tasks.map((t: any, i: number) => {
            const timeInfo = t.cronExpression ? `Lập lại: ${t.cronExpression}` : `Hẹn: ${t.dueAt || 'N/A'}`;
            return `${i + 1}. [${t.id}] "${t.label}" — ${timeInfo}`;
          }).join('\n');
          result = { status: 'success', total: res.tasks.length, reminders: formatted, info: `Found ${res.tasks.length} active reminders. Present them clearly to the user.` };
        } else {
          result = { status: 'empty', info: 'Không có nhắc nhở nào đang hoạt động.' };
        }
      } else {
        const count = reminderTimers.size;
        result = { status: count > 0 ? 'success' : 'empty', total: count, info: count > 0 ? `Có ${count} nhắc nhở đang chờ.` : 'Không có nhắc nhở nào.' };
      }
    }
    // ── Long-term Memory (Phase 3) ───────────────────
    else if (fc.name === 'remember_user_info') {
      const content = (fc.args.content || '').toString().trim();
      const category = (fc.args.category || 'fact').toString().trim() as 'fact' | 'preference' | 'event';
      const importance = Number(fc.args.importance) || 3;

      if (!content) {
        result = { status: 'error', error: 'Nội dung ghi nhớ không được để trống.' };
      } else {
        const memory = memoryService.addMemory(category, content, importance);
        console.log(`[Memory] Saved: "${content}" (${category}, importance: ${importance})`);
        result = { status: 'success', memoryId: memory.id, info: `Remembered: "${content}". DO NOT tell the user you saved it, just naturally acknowledge what they said.` };
      }
    }
    else if (fc.name === 'forget_user_info') {
      const query = (fc.args.query || '').toString().trim();
      if (!query) {
        result = { status: 'error', error: 'Cần cung cấp từ khóa để tìm ký ức cần xóa.' };
      } else {
        const matches = memoryService.searchMemories(query, 10);
        if (matches.length > 0) {
          for (const m of matches) {
            memoryService.deleteMemory(m.id);
          }
          console.log(`[Memory] Forgot ${matches.length} memories matching "${query}"`);
          result = { status: 'success', deleted: matches.length, info: `Forgot ${matches.length} memories about "${query}". Confirm to user naturally.` };
        } else {
          result = { status: 'not_found', info: `Không tìm thấy ký ức nào liên quan đến "${query}".` };
        }
      }
    }
    // ── Document Reader (Phase 5) ────────────────────
    else if (fc.name === 'read_document') {
      const filePath = (fc.args.path || '').toString().trim();
      const question = (fc.args.question || '').toString().trim();

      if (!filePath) {
        result = { status: 'error', error: 'Cần cung cấp đường dẫn file.' };
      } else if (platform.isElectron) {
        callbacks.onNotification(`📄 Đang đọc file...`);
        const res = await platform.readDocument({ path: filePath });
        if (res.success && res.text) {
          const meta = [
            `File: ${res.fileName}`,
            res.format ? `Format: ${res.format}` : '',
            res.pageCount ? `Pages: ${res.pageCount}` : '',
            `Chars: ${res.charCount}`,
            res.truncated ? '⚠️ Content was truncated due to length' : '',
          ].filter(Boolean).join(' | ');

          const instruction = question
            ? `Answer this question about the document: "${question}"`
            : 'Summarize the key points of this document for the user. Be concise but thorough.';

          // Phase 7: Auto-delegate to Ollama for long documents
          let finalContent = res.text;
          let ollamaUsed = false;
          if (res.text.length > 5000 && platform.isElectron && !question) {
            try {
              const ollamaCheck = await platform.ollamaStatus();
              if (ollamaCheck.available) {
                callbacks.onNotification(`🤖 File dài ${res.charCount} ký tự — đang dùng AI local tóm tắt...`);
                const summary = await platform.ollamaSummarize({ text: res.text, language: 'Vietnamese' });
                if (summary.success && summary.text) {
                  finalContent = `[TÓM TẮT BỞI LOCAL AI]\n${summary.text}\n\n[GHI CHÚ: Nội dung gốc ${res.charCount} ký tự đã được Local AI tóm tắt để tiết kiệm token Cloud.]`;
                  ollamaUsed = true;
                  callbacks.onNotification(`✅ Local AI đã tóm tắt xong!`);
                }
              }
            } catch (e) {
              console.log('[ToolHandler] Ollama delegation failed, using raw text:', e);
            }
          }

          result = {
            status: 'success',
            metadata: meta + (ollamaUsed ? ' | 🤖 Summarized by Local AI' : ''),
            content: finalContent,
            instruction: ollamaUsed
              ? 'Present this LOCAL AI summary to the user naturally. Mention that the document was pre-processed locally for speed.'
              : instruction,
          };
          callbacks.onNotification(`✅ Đã đọc xong: ${res.fileName} (${res.charCount} ký tự)`);
        } else {
          result = { status: 'error', error: res.error || 'Không thể đọc file.' };
        }
      } else {
        result = { status: 'not_supported', error: 'Tính năng đọc file chỉ hỗ trợ trên Desktop App.' };
      }
    }
    else if (fc.name === 'report_language_change') {
      const lang = fc.args.language || "Unknown";
      callbacks.onNotification(`Đang dịch ngôn ngữ: ${lang}`);
      result = { status: "reported" };
    }
    else if (fc.name === 'generate_document') {
      const docType = (fc.args.doc_type || 'content').toString().trim();
      const title = (fc.args.title || 'Tài liệu').toString().trim();
      const content = (fc.args.content || '').toString();
      const to = (fc.args.to || '').toString().trim();
      const subject = (fc.args.subject || '').toString().trim();

      const doc: GeneratedDocument = {
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: docType as GeneratedDocument['type'],
        title,
        content,
        metadata: {
          ...(to ? { to } : {}),
          ...(subject ? { subject } : {}),
        },
        createdAt: Date.now(),
      };

      if (callbacks.onDocumentGenerated) {
        callbacks.onDocumentGenerated(doc);
      }

      const typeLabels: Record<string, string> = {
        plan: 'Kế hoạch', email: 'Email', content: 'Nội dung', spreadsheet: 'Bảng tính'
      };
      callbacks.onNotification(`📄 Đã tạo ${typeLabels[docType] || 'tài liệu'}: ${title}`);
      result = { status: "success", info: `Document '${title}' has been created and displayed to the user. Tell them you've finished creating the document and they can view, edit, copy, or download it.` };
    }
    else if (fc.name === 'update_meeting_notes') {
      const speaker = (fc.args.speaker || 'Unknown').toString().trim();
      const content = (fc.args.content || '').toString().trim();
      const noteType = (fc.args.note_type || 'speech').toString().trim() as MeetingNoteType;

      if (content) {
        const note: MeetingNoteEntry = {
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          speaker,
          content,
          type: noteType,
        };
        if (callbacks.onMeetingNoteUpdate) {
          callbacks.onMeetingNoteUpdate(note);
        }
        result = { status: 'success', info: 'Note added to meeting panel. Continue listening and adding notes as you hear more content.' };
      } else {
        result = { status: 'skipped', info: 'Empty content, no note added.' };
      }
    }
    else if (fc.name === 'search_legal_docs') {
      const query = (fc.args.query || "").toString().toLowerCase();
      const context = settings?.fileContext || "";

      if (!context) {
        result = { found: false, message: "Documents empty." };
      } else {
        const matches = (await findRelevantParagraphs(query, context, 3)).join("\n---\n");
        if (matches) {
          result = { found: true, content: matches };
        } else {
          result = { found: false, message: "Not found in documents." };
        }
      }
    }

    // ── File Search & Navigation ──────────────────────────────
    else if (fc.name === 'search_files') {
      const query = (fc.args.query || '').toString().trim();
      const scope = (fc.args.scope || 'documents').toString().trim();
      const fileType = (fc.args.file_type || '*').toString().trim();

      if (!query) {
        result = { status: 'error', error: 'Vui lòng cung cấp từ khóa tìm kiếm.' };
      } else if (callbacks.onSearchFiles) {
        callbacks.onNotification(`🔍 Đang tìm kiếm "${query}"...`);
        const res = await callbacks.onSearchFiles({ query, scope, file_type: fileType });
        if (res.success && res.results.length > 0) {
          // Format results for Gemini to read
          const formattedResults = res.results.map((r: any, i: number) => {
            const sizeStr = r.type === 'folder' ? 'thư mục' : 
              r.size > 1048576 ? `${(r.size / 1048576).toFixed(1)} MB` :
              r.size > 1024 ? `${(r.size / 1024).toFixed(0)} KB` : `${r.size} B`;
            return `${i + 1}. [${r.type === 'folder' ? '📁' : '📄'}] ${r.name} — ${sizeStr} — Sửa: ${r.modified}\n   📍 ${r.path}`;
          }).join('\n');
          callbacks.onNotification(`✅ Tìm thấy ${res.results.length} kết quả cho "${query}"`);
          result = { 
            status: 'success', 
            total_found: res.results.length,
            results: formattedResults,
            info: `Found ${res.results.length} results. Present these to the user clearly. If they want to open a result, use the open_path tool with the exact path shown above.`
          };
        } else if (res.success && res.results.length === 0) {
          result = { status: 'not_found', info: `Không tìm thấy file/folder nào khớp "${query}" trong ${scope}.` };
        } else {
          result = { status: 'error', error: res.error || 'Search failed' };
        }
      } else {
        result = { status: 'not_supported', error: 'Tính năng tìm file chỉ hỗ trợ trên Desktop App.' };
      }
    }
    else if (fc.name === 'open_path') {
      const targetPath = (fc.args.path || '').toString().trim();
      const revealInFolder = fc.args.reveal_in_folder === true;

      if (!targetPath) {
        result = { status: 'error', error: 'Không có đường dẫn. Hãy cho tôi biết bạn muốn mở file/folder nào.' };
      } else if (callbacks.onOpenPath) {
        callbacks.onNotification(`📂 Đang mở ${revealInFolder ? 'thư mục chứa' : ''}: ${targetPath.split('\\').pop()}...`);
        const res = await callbacks.onOpenPath({ path: targetPath, reveal_in_folder: revealInFolder });
        if (res.success) {
          const actionMsg = res.action === 'revealed_in_folder' ? 'hiển thị trong File Explorer' : 'mở thành công';
          const noteMsg = res.note ? ` Lưu ý: ${res.note}` : '';
          result = { status: 'success', info: `Đã ${actionMsg}: ${targetPath}.${noteMsg} Xác nhận với user.` };
        } else {
          result = { status: 'error', error: res.error || 'Không thể mở.' };
        }
      } else {
        result = { status: 'not_supported', error: 'Tính năng mở file chỉ hỗ trợ trên Desktop App.' };
      }
    }
    else if (fc.name === 'close_folder_window') {
      const targetPath = (fc.args.path || '').toString().trim();
      const closeAll = fc.args.close_all === true;

      if (callbacks.onCloseFolderWindow) {
        callbacks.onNotification(`📁 Đang đóng cửa sổ thư mục...`);
        const res = await callbacks.onCloseFolderWindow({ path: targetPath, close_all: closeAll });
        if (res.success) {
          result = { status: 'success', info: `Đã đóng ${res.closed} cửa sổ File Explorer. Xác nhận với user.` };
          callbacks.onNotification(`✅ Đã đóng ${res.closed} cửa sổ thư mục.`);
        } else {
          result = { status: 'error', error: res.error || 'Không thể đóng cửa sổ.' };
        }
      } else {
        result = { status: 'not_supported', error: 'Tính năng đóng thư mục chỉ hỗ trợ trên Desktop App.' };
      }
    }
    // ── Plugin Fallback (Phase 4) ─────────────────────
    // If no built-in handler matched, try executing as a plugin
    else if (platform.isElectron) {
      const isPlugin = await platform.hasPlugin(fc.name);
      if (isPlugin) {
        callbacks.onNotification(`🧩 Đang chạy plugin: ${fc.name}...`);
        const res = await platform.executePlugin(fc.name, fc.args);
        if (res.success) {
          result = { status: 'success', ...res.result };
          callbacks.onNotification(`✅ Plugin ${fc.name} hoàn thành`);
        } else {
          result = { status: 'error', error: res.error || 'Plugin execution failed' };
        }
      }
    }
    // Pass the response back to liveService to actually send it to Gemini
    sendResponseCallback(fc, result);
  }
}
