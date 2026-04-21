import { FunctionDeclaration, Type } from "@google/genai";
// [DISABLED] Presentation mode temporarily disabled
// import { presentationToolDeclaration } from "./presentationMode";

export const customTools: FunctionDeclaration[] = [
  {
    name: "play_music",
    description: "Search and play music on Zing MP3 (Vietnamese music platform). Use this when the user asks to play/listen to a SONG or music, especially Vietnamese music (V-Pop, Bolero, etc.). Prefer this over YouTube for pure music listening.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        search_query: { type: Type.STRING, description: "The exact song name, artist, or keywords to search (e.g. 'Chúng Ta Của Hiện Tại Sơn Tùng', 'nhạc buồn', 'Đen Vâu Lối Nhỏ')." }
      },
      required: ["search_query"]
    }
  },
  {
    name: "open_google_search",
    description: "Opens a Google Search tab in the user's browser. ONLY use this when the user EXPLICITLY asks to open/view Google search results in their browser (e.g., 'mở Google tìm...', 'tra Google cho tôi xem', 'search Google for...'). This tool DOES NOT return results to you. For factual questions (weather, news, prices, current events), DO NOT use this tool — you already have built-in Google Search grounding that provides real results automatically. Just answer directly.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "The search query in the most relevant language (e.g. 'thời tiết Hà Nội hôm nay')" }
      },
      required: ["query"]
    }
  },
  {
    name: "open_url",
    description: "Open a specific website directly. Use this when the user asks to open a specific website or platform (e.g., 'mở facebook', 'mở gemini', 'mở github', 'open website X'). Do your best to construct the correct URL.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "The full URL to open, e.g., 'https://gemini.google.com', 'https://facebook.com', 'https://github.com'." }
      },
      required: ["url"]
    }
  },
  {
    name: "play_youtube_video",
    description: "Search and play a video on YouTube. Use this when the user asks to play music or watch a video.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        search_query: { type: Type.STRING, description: "The exact keywords or title of the video the user wants to watch (e.g. 'Son Tung MTP', 'Fireworks in Hong Kong'). Do NOT try to guess the Video ID." }
      },
      required: ["search_query"]
    }
  },
  {
    name: "set_reminder",
    description: "Set a reminder or schedule a recurring task. Supports one-time delays (e.g., 'after 30 minutes') or recurring schedules (e.g., 'every day at 7am'). For recurring, use cron expressions like '0 7 * * *' for daily 7am. For one-time, use delay_minutes.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING, description: "What to remind the user about" },
        delay_minutes: { type: Type.NUMBER, description: "Minutes from now for one-time reminder (use this OR cron_expression)" },
        cron_expression: { type: Type.STRING, description: "Cron expression for recurring schedule, e.g. '0 7 * * *' = daily 7am, '*/30 * * * *' = every 30 min. Use this OR delay_minutes." },
        repeat: { type: Type.BOOLEAN, description: "True for recurring reminders, false for one-time. Default: false" }
      },
      required: ["label"]
    }
  },
  {
    name: "cancel_reminder",
    description: "Cancel/remove an active reminder or scheduled task by its ID. Use list_reminders first to get available IDs.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reminder_id: { type: Type.STRING, description: "The ID of the reminder to cancel" }
      },
      required: ["reminder_id"]
    }
  },
  {
    name: "list_reminders",
    description: "List all active reminders and scheduled tasks. Use when user asks 'what reminders do I have?' or 'show my schedules'.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  },
  {
    name: "enter_deep_sleep",
    description: "Enter deep sleep mode (Always On Display) when the user says goodnight or wants to stop interacting.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  },
  {
    name: "open_settings",
    description: "Open the settings menu when the user asks to open settings.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  },
  {
    name: "close_settings",
    description: "Close/dismiss the settings menu when the user asks to close or exit settings. Use when user says 'đóng cài đặt', 'tắt settings', 'thoát cài đặt'.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  },
  {
    name: "toggle_mute",
    description: "Mute or unmute yourself (the assistant). Use when user says 'tắt tiếng' or 'im lặng' (mute), or 'bật tiếng' (unmute).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mute: { type: Type.BOOLEAN, description: "True to mute, False to unmute." }
      },
      required: ["mute"]
    }
  },
  {
    name: "toggle_screen_vision",
    description: "Enable or disable screen sharing/screen vision so you can see the user's screen. Use when user says 'bật xem màn hình' or 'tắt xem màn hình'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        enable: { type: Type.BOOLEAN, description: "True to enable screen vision, False to disable." }
      },
      required: ["enable"]
    }
  },
  {
    name: "toggle_camera_vision",
    description: "Enable or disable camera vision so you can see the user through the webcam. Use when user says 'nhìn tôi' or 'bật camera', 'tắt camera'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        enable: { type: Type.BOOLEAN, description: "True to enable camera vision, False to disable." }
      },
      required: ["enable"]
    }
  },
  {
    name: "toggle_meeting_mode",
    description: "Enable or disable meeting mode (chế độ ghi chú cuộc họp, bài giảng, meeting notes). Use when user asks you to start taking notes for a meeting, enter meeting mode, or stop meeting mode.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        enable: { type: Type.BOOLEAN, description: "True to enable meeting/notes mode, False to disable." }
      },
      required: ["enable"]
    }
  },
  {
    name: "clear_chat",
    description: "Clear the current chat history/screen. Use when user says 'xóa màn hình', 'xóa tin nhắn', 'xóa lịch sử chat'.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  },
  {
    name: "change_background",
    description: "Change the UI background theme. Use when user asks to change background, shape, or theme. Available options: 'default', 'office', 'scifi', 'anime_room'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        bg_name: { type: Type.STRING, description: "The background name to set. Valid: 'default', 'office', 'scifi', 'anime_room'." }
      },
      required: ["bg_name"]
    }
  },
  {
    name: "close_browser_tabs",
    description: "Close specific browser tabs based on user keywords. Useful when the user wants to close Facebook, Google Search, or keep only YouTube open.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        match_keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Close tabs that contain ANY of these keywords (e.g. ['Google', 'Facebook'])." },
        exclude_keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Do NOT close tabs that contain ANY of these keywords. These tabs will be kept safe (e.g. ['YouTube', 'Gemini'])." },
        close_all: { type: Type.BOOLEAN, description: "If true, closes ALL tabs on the browser EXCEPT those matching 'exclude_keywords'." }
      }
    }
  },
  {
    name: "report_language_change",
    description: "Report the detected language when it changes during translation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        language: { type: Type.STRING, description: "The detected language name" }
      },
      required: ["language"]
    }
  },
  {
    name: "generate_document",
    description: "Generate a structured document when the user asks you to create a plan, schedule, email, content draft, article, report, or spreadsheet/table. ALWAYS use this tool instead of just speaking the content. The document will be displayed in a beautiful panel with copy/download buttons. Use Markdown formatting for content. For spreadsheets, use Markdown table format (| col1 | col2 |). After calling this tool, confirm verbally to the user that you have created the document.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        doc_type: { type: Type.STRING, description: "Type of document: 'plan' for schedules/project plans, 'email' for emails, 'content' for articles/reports/drafts, 'spreadsheet' for tables/data/excel." },
        title: { type: Type.STRING, description: "Title of the document (e.g. 'Kế hoạch dự án Website', 'Email xin nghỉ phép', 'Bảng so sánh sản phẩm')." },
        content: { type: Type.STRING, description: "The full document content in Markdown format. Use headers (##), bullet lists (-), bold (**text**), and Markdown tables (| col | col |) as appropriate for the document type." },
        to: { type: Type.STRING, description: "Email recipient (only for doc_type='email')." },
        subject: { type: Type.STRING, description: "Email subject line (only for doc_type='email')." }
      },
      required: ["doc_type", "title", "content"]
    }
  },
  {
    name: "update_meeting_notes",
    description: "Add a new entry to the live meeting notes panel displayed to the user. Call this FREQUENTLY during meeting mode whenever you hear important content — key points, decisions, action items, or questions. Each call adds one note entry that appears in real-time on the user's screen. Do NOT wait until the meeting ends to call this. Call it as soon as you hear something noteworthy.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        speaker: { type: Type.STRING, description: "Who is speaking - use a label like 'Speaker 1', 'Speaker 2', 'Giáo viên', 'Sếp', or a name if you can identify them. Use consistent labels for the same person throughout the meeting." },
        content: { type: Type.STRING, description: "The key point, decision, action item, or question being discussed. Keep it concise but informative (1-3 sentences max)." },
        note_type: { type: Type.STRING, description: "Type of note: 'speech' for general discussion points, 'decision' for decisions made, 'action' for action items/assignments, 'question' for questions raised." }
      },
      required: ["speaker", "content", "note_type"]
    }
  },
  {
    name: "search_legal_docs",
    description: "Search for specific information in the provided knowledge base/documents.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "The keyword to search for" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_files",
    description: "Tìm kiếm tệp tin và thư mục trên máy tính của user. Sử dụng khi user yêu cầu tìm file, tài liệu, hình ảnh, hoặc thư mục trong ổ đĩa. Trả về danh sách kết quả gồm tên, đường dẫn, loại, kích thước, và ngày sửa đổi.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Từ khóa tìm kiếm (tên file hoặc thư mục, ví dụ: 'báo cáo', 'report', 'MyProject')" },
        scope: { type: Type.STRING, description: "Phạm vi tìm kiếm: 'documents' (Tài liệu), 'desktop' (Màn hình), 'downloads' (Tải về), 'pictures' (Hình ảnh), 'all' (Toàn bộ thư mục người dùng), hoặc đường dẫn cụ thể như 'E:\\Data'" },
        file_type: { type: Type.STRING, description: "Lọc theo phần mở rộng: 'pdf', 'docx', 'xlsx', 'png', 'jpg', 'txt', 'mp4', '*' (tất cả). Bỏ qua nếu không cần lọc." }
      },
      required: ["query"]
    }
  },
  {
    name: "open_path",
    description: "Mở tệp tin hoặc thư mục trên máy tính. Dùng sau khi đã tìm thấy file/folder bằng search_files, hoặc khi user cung cấp đường dẫn cụ thể. Có thể mở bằng ứng dụng mặc định hoặc hiện trong File Explorer.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "Đường dẫn tuyệt đối đến file hoặc thư mục (ví dụ: 'E:\\\\Data\\\\MyProject\\\\2025')" },
        reveal_in_folder: { type: Type.BOOLEAN, description: "true = mở File Explorer và highlight file/folder, false = mở bằng ứng dụng mặc định (Word, Excel, trình xem ảnh, etc.)" }
      },
      required: ["path"]
    }
  },
  {
    name: "close_folder_window",
    description: "Đóng cửa sổ File Explorer (thư mục) đang mở trên máy tính. Dùng khi user yêu cầu đóng/tắt cửa sổ thư mục, Explorer, hoặc tất cả cửa sổ folder. Có thể đóng cửa sổ cụ thể (theo path) hoặc đóng tất cả.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "Đường dẫn thư mục cần đóng (ví dụ: 'E:\\\\Data'). Bỏ qua nếu đóng tất cả." },
        close_all: { type: Type.BOOLEAN, description: "true = đóng TẤT CẢ cửa sổ File Explorer, false = chỉ đóng cửa sổ khớp path" }
      }
    }
  },
  // [DISABLED] presentationToolDeclaration — tạm tắt tính năng thuyết trình
];

// ── Document Reader Tools (Phase 5) ────────────────────
export const documentTools: FunctionDeclaration[] = [
  {
    name: "read_document",
    description: "Read and extract text content from a document file (PDF, DOCX, TXT, MD, CSV, code files). Use when the user asks to 'read file', 'xem nội dung file', 'đọc file', 'analyze/phân tích tài liệu', 'summarize/tóm tắt file'. You MUST have the file path first (use search_files if needed). After reading, summarize the key points for the user.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "Absolute path to the file, e.g. 'E:\\Users\\docs\\report.pdf'" },
        question: { type: Type.STRING, description: "Optional: specific question to answer about the document content" }
      },
      required: ["path"]
    }
  },
];

// ── Memory Tools (Phase 3) ──────────────────────────────
export const memoryTools: FunctionDeclaration[] = [
  {
    name: "remember_user_info",
    description: "Save an important fact, preference, or habit about the user to long-term memory. Use when user shares personal info like name, preferences, habits, work style, or explicitly asks you to remember something. Categories: 'fact' (name, job, family), 'preference' (likes, dislikes, style), 'event' (important dates, milestones).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING, description: "What to remember about the user" },
        category: { type: Type.STRING, description: "Category: 'fact', 'preference', or 'event'" },
        importance: { type: Type.NUMBER, description: "Importance level 1-5 (5 = critical, 1 = minor). Default: 3" }
      },
      required: ["content", "category"]
    }
  },
  {
    name: "forget_user_info",
    description: "Remove/forget specific information about the user from long-term memory. Use when user says 'forget about X' or 'don't remember X anymore'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "What to forget/search for in memories to delete" }
      },
      required: ["query"]
    }
  },
];

// Combine all tools for export
export const allTools: FunctionDeclaration[] = [...customTools, ...documentTools, ...memoryTools];

export const LANGUAGE_NAMES: { [key: string]: string } = {
  'vi': 'Vietnamese', 'en': 'English', 'ja': 'Japanese', 'ko': 'Korean',
  'zh': 'Chinese (Mandarin)', 'hi': 'Hindi (Indian)', 'ru': 'Russian',
  'fr': 'French', 'de': 'German', 'es': 'Spanish', 'it': 'Italian',
  'pt': 'Portuguese', 'th': 'Thai', 'id': 'Indonesian', 'ar': 'Arabic'
};
