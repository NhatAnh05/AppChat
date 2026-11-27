# LyraChat – Gọi thoại / gọi video (WebRTC)

## Cấu trúc
- `src/components/CallOverlay.tsx`: giao diện gọi, cấp quyền mic/camera, WebRTC peer connection, nhạc chuông theo trạng thái (chưa có âm thanh chuông), nhận/từ chối và kết thúc.
- `src/services/callEvents.ts`: sự kiện bấm nút gọi từ ChatWindow.
- `server/call-signaling.mjs`: signaling WebSocket Node.js (không phụ thuộc thư viện ngoài) cho **thử nghiệm cục bộ**.
- `scripts/dev-full.mjs`: khởi động Vite, media server và signaling.
- `vite.config.ts`: proxy `/api/calls` đến signaling port 8788.

## Chạy với WebStorm
1. Cài dependency `npm install` (cần internet ở máy của bạn).
2. Chạy `npm run dev:full` rồi mở `http://localhost:5173`.
3. Mở **hai trình duyệt hoặc hai phiên đăng nhập độc lập**: đăng nhập 2 tài khoản khác nhau (ví dụ `TuanAnh`, `TuyetMinh`). Không dùng hai tab cùng username vì signaling chỉ duy trì một kết nối trên mỗi username.
4. Tài khoản A vào cuộc trò chuyện của B, nhấn điện thoại hoặc camera.
5. Tài khoản B thấy hộp thoại đến, chọn Trả lời hoặc Từ chối. Cấp quyền camera/micro khi trình duyệt hỏi.
6. Kiểm tra tắt/bật mic, camera, kết thúc, gọi lại.

**Lưu ý:** Chỉ hỗ trợ cuộc gọi 1-1. Nhóm sẽ bị vô hiệu hóa nút gọi để tránh hiểu lầm là đã có nhóm call.

## Giới hạn quan trọng
- API WebSocket chat của giảng viên **không cung cấp signaling**. Cuộc gọi chạy qua server phụ trợ của LyraChat, không phải event của API giảng viên.
- Signaling server mặc định `127.0.0.1:8788` và **không xác thực danh tính thực sự**: chỉ dùng để thử nghiệm trên máy cá nhân. KHÔNG mở cổng này cho Internet hoặc đưa lên hosting công khai trước khi tích hợp xác thực phiên, phân quyền, chống giả mạo tài khoản và rate limit.
- WebRTC sử dụng STUN công khai. Mạng NAT nghiêm ngặt sẽ cần TURN server có xác thực để truyền media ổn định.
- Truy cập qua mạng ngoài localhost cần HTTPS/WSS và thiết lập reverse proxy theo hạ tầng triển khai. Trình duyệt thường không cấp `getUserMedia` trên HTTP không bảo mật.
- Người nhận phải mở ứng dụng và kết nối signaling; chưa có thông báo cuộc gọi khi app đã đóng, push notification, ghi âm, chia sẻ màn hình hoặc gọi nhóm.
- Tin nhắn hiện có và lỗi lịch sử nhóm `ACTION_NOT_EXIT` không được thay đổi bởi chức năng gọi.

## Kiểm thử
- `npm test`: kiểm thử tự động, bao gồm signaling hai đầu.
- Kiểm thử thực tế camera/micro bắt buộc trên Chrome/Edge vì Node.js không cung cấp WebRTC browser.
