# Nhật ký thay đổi (Changelog)

Tất cả các thay đổi đáng chú ý của dự án sẽ được ghi lại trong tệp này.

## [1.2.0] - 2026-04-22
### Mới (Added)
- **Chế độ ngoại tuyến (Offline Mode)**: Hỗ trợ tải các mô hình Live2D và tài nguyên cục bộ mà không cần kết nối mạng.
- **Tích hợp Wedplan-AI**: Bổ sung tính năng gợi ý thông minh dựa trên AI cho các tác vụ lập kế hoạch.
- **Meeting Mode (Beta)**: Ghi chú cuộc họp tự động, ghim ghi chú, phân loại phiên làm việc và xuất biên bản.

### Thay đổi (Changed)
- **Chuyển đổi sang Vite**: Đã di chuyển toàn bộ hệ thống build sang Vite để tăng tốc độ phát triển và tối ưu hóa hiệu suất ứng dụng.
- **Chuẩn hóa Typography**: Đồng bộ hóa phông chữ hệ thống sang Roboto, chuẩn hóa kích thước văn bản.
- **Tối ưu hóa Electron**: Hoàn thiện đóng gói ứng dụng Aura Studio, xử lý chính xác các đường dẫn tài nguyên tĩnh và biểu tượng ứng dụng.

### Sửa lỗi (Fixed)
- **Lỗi 503 Service Unavailable**: Triển khai cơ chế retry (exponential backoff) để xử lý các lỗi máy chủ từ API.
- Sửa lỗi màn hình trắng của ứng dụng trên môi trường phát triển.
- Giải quyết các xung đột hệ thống ngầm và tối ưu hóa luồng dữ liệu thời gian thực.
- Cập nhật tài liệu hệ thống và khắc phục các vấn đề dựa trên phân tích lỗi gần đây.

## [1.1.0] - 2026-04-16
### Mới (Added)
- Bổ sung tính năng tự động trình bày (Presentation Mode).
- Cải thiện phản hồi tìm kiếm bằng trí tuệ nhân tạo.
- Hỗ trợ tìm kiếm tệp tin và điều hướng cục bộ.

### Sửa lỗi (Fixed)
- Tối ưu hóa xử lý lỗi máy chủ liên quan đến AI generation.
- Sửa các lỗi gián đoạn âm thanh trong quá trình phản hồi của trợ lý ảo.
