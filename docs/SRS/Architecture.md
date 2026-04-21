# Kế Hoạch Kiến Trúc Hệ Thống: Aura Assistant (Đa Nền Tảng)

Tài liệu này xác định các quy tắc kiến trúc (Platform Separation) chia tách Electron (Desktop) và WebApp nhằm giải quyết vấn đề Code Pollution và tăng cường khả năng mở rộng.

## 1. Mô Hình Tổng Quan (Overview)
Dự án Aura Assistant tích hợp thiết kế **Platform-Agnostic UI** kết hợp với **Adapter Pattern**. 
Thay vì nhồi nhét logic kiểm tra môi trường (`if (isElectron) ... else ...`) vào từng Components gây ra Nợ Kỹ Thuật (Technical Debt), dự án định cấu trúc rớt luồng ngay từ khi tải App (Entry Point).

## 2. Platform Router (`App.tsx`)
File `App.tsx` ở thư mục gốc hoạt động với tư cách là một **Cổng Phân Luồng (Router)**:
- Xác minh môi trường thông qua cờ `platformBridge.isElectron`.
- Nếu `true`: Tải động (React.lazy) giao diện `src/desktop/AppDesktop.tsx`.
- Nếu `false`: Tải động (React.lazy) giao diện `src/webapp/AppWeb.tsx`.

> Tính năng Lazy Load này rất quan trọng để WebApp không phải tải các packages, API nặng liên quan tới Electron, giúp tăng tốc độ tải trang.

## 3. Platform Bridge (`src/shared/platformBridge.ts`)
Đây là trái tim của kiến trúc Adapter. Bridge định nghĩa một Interface duy nhất (`IPlatformBridge`) để giao tiếp hệ điều hành mà không làm vỡ Native Web App.
- **Electron Bridge**: Thực thi thực tế (Proxy calls) gửi tiến trình xuôi về phía Electron IPC thông qua `window.electronAPI`.
- **Web Bridge**: Đóng vai trò là Fallback (No-op) an toàn thay thế việc gây lỗi. Trên Web, `captureScreen` trả về `null` thay vì Crash app.

> Tuyệt đối **không** import `window.electronAPI` trực tiếp trong bất kỳ react component nào. Mọi giao tiếp Platform-specific phải vượt qua `platformBridge.ts`.

## 4. Phân Định Thư Mục (Code Organization)
Việc phân chia thư mục phải cực kỳ nghiêm ngặt để đảm bảo Boundary:
- `src/desktop/`: Mã nguồn giao diện đặc thù cho Electron (Transparent Window, Scroll to Zoom avatar, Custom Window Control).
- `src/webapp/`: Giao diện đặc thù chạy trên trình duyệt (Responsive Layout, Browser Permission Handlers).
- `src/shared/`: Chứa các "Business Logic" vô định dạng (không phụ thuộc platform). Bao gồm các `hook`, `services`, `types` và `components` chia sẻ giữa Desktop và Web.
- `electron/`: Tiến trình Main của Electron (Tách biệt hoàn toàn khỏi Webpack/Vite build cho React).

## 5. Nợ Kỹ Thuật Đang Tồn Đọng (Technical Debt)
1. **Migration Chưa Hoàn Tất:** Hiện tại các module chức năng chung đang rải rác bên ngoài thay vì nằm gọn trong `src/shared/`.
   - Bị rải bên ngoài: `components/`, `services/`, `hooks/`, `utils/`.
   - Cần một quá trình Refactoring để đưa tất cả chúng đi vào `src/shared/{module}/`.
2. **Web Audio Permission:** Chưa có Flow xin phép quyền ghi âm (First-click interaction) rõ ràng cho AppWeb, dẫn tới lỗi Web Audio Context Suspended trên trình duyệt.

---
*Tài liệu này được giám sát và bảo vệ bởi AI Structure Guardian. Bất kỳ sự thay đổi code nào đi chệch lại với kiến trúc được lập luồng ở đây (Ví dụ: Thêm tính năng Electron IPC vào thẳng Shared Component) đều sẽ bị từ chối.*
