# APPCHAT — GIAI ĐOẠN 1

## Chạy trên WebStorm
1. File > Open > chọn thư mục `AppChat-main` chứa `package.json`.
2. Terminal: `npm install`
3. Terminal: `npm run dev`
4. Truy cập địa chỉ Local Vite thông báo (thường là http://localhost:5173/).

## Những thay đổi
- Thêm màn hình Đăng ký/Đăng nhập **demo** (`src/pages/AuthPage.tsx`).
- Thêm trang Hồ sơ cá nhân, chỉnh tên và mô tả (`src/pages/ProfilePage.tsx`).
- Tách kiểu tài khoản (`src/types/account.ts`), lưu trữ demo (`src/services/demoStorage.ts`), quản lý cuộc trò chuyện (`src/hooks/useDemoChats.ts`).
- Chọn người liên hệ để tạo cuộc trò chuyện demo; gửi tin nhắn bằng Enter hoặc nút Gửi; Shift+Enter để xuống dòng.
- Tin nhắn mới, cuộc hội thoại mới và cài đặt thông báo demo lưu vào localStorage; tài khoản đang mở lưu trong sessionStorage.
- Cài đặt cho phép mở trang hồ sơ, bật/tắt thông báo demo và đăng xuất.
- Bổ sung giao diện biểu mẫu, trạng thái focus, responsive cơ bản.

## LƯU Ý QUAN TRỌNG
- Đây chỉ là giao diện thử nghiệm frontend. **Chưa có backend, database, API, WebSocket hoặc xác thực thực sự.**
- **Không lưu mật khẩu demo**. Mọi chuỗi >= 6 ký tự đều được chấp nhận tại màn hình đăng nhập của tài khoản demo đã đăng ký. Không dùng mật khẩu thật.
- Tin nhắn KHÔNG truyền đến người dùng khác; chỉ lưu trong cùng trình duyệt. localStorage không phải nơi lưu dữ liệu nhạy cảm.
- Dữ liệu demo của tất cả tài khoản trên cùng trình duyệt đang dùng chung; cần tách theo user khi xây dựng backend.
- Chưa có gửi tệp, gọi điện thực tế, phân quyền, reset mật khẩu, dark mode thực sự, thông báo trình duyệt.
- Trong môi trường đóng gói, npm không hoàn tất cài dependencies nên **chưa xác nhận build thành công**. Hãy chạy `npm install` và `npm run build` tại máy bạn để kiểm tra.

## Giai đoạn tiếp theo
Xây dựng backend (Spring Boot + MySQL), authentication an toàn, REST API, WebSocket, trạng thái gửi/nhận/đã xem, bảo vệ dữ liệu từng người dùng.
