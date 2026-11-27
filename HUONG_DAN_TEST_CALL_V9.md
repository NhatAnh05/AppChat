# LyraChat v9 — Trạng thái cấp quyền micro/camera khi nhận cuộc gọi

## Thay đổi
- Người nhận nhấn Trả lời sẽ gửi tín hiệu `preparing` trước khi trình duyệt hỏi quyền micro/camera.
- Người gọi nhìn thấy `Người nhận đang cấp quyền micro/camera` thay vì tiếp tục báo đổ chuông.
- Người nhận thấy hướng dẫn bấm Allow/Cho phép. Chỉ gửi `accept` sau khi lấy được luồng media.
- Nếu 60 giây người nhận vẫn chưa cấp quyền, người gọi nhận lỗi rõ ràng và kết thúc lần gọi.
- Không giữ camera/micro nếu cuộc gọi đã bị kết thúc trong khi đang xin quyền.

## Chạy thử trong WebStorm
1. `npm install`
2. `npm run dev:full` (cần giữ terminal này đang chạy)
3. Đăng nhập hai tài khoản khác nhau trong Chrome và Edge.
4. Bấm gọi video ở tài khoản A. Tài khoản B bấm Trả lời, sau đó chọn `Allow while visiting the site` hoặc `Allow this time` cho camera/micro.
5. Nếu bên A bị hỏi quyền thì cũng phải bấm Allow. Quan sát video của hai bên.
6. Đảm bảo không mở cùng tài khoản ở nhiều tab (signaling chỉ giữ một WebSocket/tài khoản).

## Phạm vi
- Đây là bản sửa đồng bộ trạng thái chờ quyền, không chứng minh kết nối media đã thành công với trình duyệt thật.
- Cả hai tài khoản phải chạy cùng bản frontend v9 và signaling v9.
- Khi triển khai liên mạng Internet cần HTTPS/WSS, TURN và xác thực tài khoản ở signaling server.
