# LyraChat – Giai đoạn 3, 4, 5 và khắc phục lỗi WebSocket

## Mục tiêu

Tiếp tục từ source AppChat(2).zip. Không thay đổi giao thức đăng nhập/gửi tin đã có; không tạo dữ liệu chat giả để che lỗi server.

## Các thay đổi đã triển khai

### Sửa lỗi lịch sử liên tục báo ACTION_NOT_EXIT

- Ưu tiên tên event từ tài liệu giảng viên: `CHAT_PEOPLE_GET_MES`.
- Nếu server chủ động trả `ACTION_NOT_EXIT`, tự thử *một lần* event cũ tương ứng:
  - Chat cá nhân: `GET_PEOPLE_CHAT_MES`.
  - Chat nhóm: `GET_ROOM_CHAT_MES`.
- Nhớ tên event hoạt động trên socket hiện tại; không phải thử lại mỗi lần.
- Nếu cả hai event bị từ chối, hiển thị lỗi rõ ràng và ngừng polling lịch sử cho loại chat đó trong phiên WebSocket hiện tại. Không khẳng định lịch sử đã tải nếu server không trả dữ liệu.
- Giao thức này không có request ID. Thêm khóa dùng chung cho yêu cầu kiểm tra online và lấy lịch sử để tránh kết quả `ACTION_NOT_EXIT` của một request bị nhầm sang request kia.
- Sửa xử lý phản hồi thành công của `GET_ROOM_CHAT_MES` (event cũ) mà không trộn với lịch sử chat cá nhân.
- Dừng hiển thị đồng thời dòng "Đang tải" và "Chưa có tin nhắn" khi lịch sử lỗi.

**Lưu ý:** Server thật có thể chạy phiên bản API khác tài liệu. Nếu cả hai tên event đều không hỗ trợ, frontend không thể tạo lại lịch sử từ server; cần giảng viên xác nhận tên event/phiên bản server.

### Giai đoạn 3: Quản lý nhóm

- Tìm thành viên trong phần Thông tin nhóm, không phân biệt dấu.
- Sao chép tên nhóm để người khác nhập vào mục Tham gia nhóm.
- Nhấn "Nhắc tên" để điền `@username` vào ô soạn tin nhắn; đây là **văn bản**, không phải sự kiện thông báo mention từ server.
- Vẫn dùng `JOIN_ROOM`, `OUT_ROOM`, `SEND_CHAT` của API.
- Chủ phòng vẫn không được tự rời phòng theo quy tắc server.

### Giai đoạn 4: Giao diện và trải nghiệm

- Gộp công cụ Tin nhắn/Đã lưu/Ảnh & tệp/Chọn nhiều vào khu vực **Công cụ** có nút mở/thu gọn, mặc định thu gọn để tiết kiệm diện tích.
- Thanh công cụ không còn dùng `position: sticky` dễ che vùng chat trong lúc cuộn.
- Lỗi gửi tin hoặc media hiển thị ngay phía trên ô nhập, cho phép đóng; không dùng `alert()` cản giao diện.
- Bổ sung CSS light/dark, kích thước nhỏ.

### Giai đoạn 5: Thông báo và quyền riêng tư

- Trong Cài đặt → Quyền riêng tư có nút xin quyền thông báo trình duyệt.
- Chỉ gửi thông báo desktop nếu: người dùng cho phép, trình duyệt ở nền và tin mới đến từ người khác.
- Không hiển thị nội dung tin nhắn trong thông báo.
- Hồ sơ người dùng vẫn chỉ lưu ở trình duyệt. API hiện tại chưa hỗ trợ đồng bộ hồ sơ/avatar, typing, read receipt và tín hiệu WebRTC; các tính năng này **chưa được triển khai**.

## Cách chạy trên WebStorm (Windows)

1. Sao lưu thư mục repo gốc. Giải nén source mới vào bản sao của repo (giữ `.git` hiện tại).
2. Mở Terminal ở thư mục có `package.json`.
3. Chạy `npm ci`, `npm test`, `npm run build`, `npm run dev:full`.
4. Mở địa chỉ Vite (thường là http://localhost:5173/chat).
5. Dùng hai tài khoản thực, tốt nhất một tài khoản ở trình duyệt thường và tài khoản còn lại ở cửa sổ ẩn danh.

## Checklist test với server giảng viên

1. A mở chat với B: nhật ký gửi `CHAT_PEOPLE_GET_MES`; nếu báo `ACTION_NOT_EXIT`, ứng dụng thử `GET_PEOPLE_CHAT_MES` đúng một lần. Quan sát có nhận lịch sử hay lỗi không hỗ trợ. Mở nhiều chat, kiểm tra nhật ký không còn lặp liên tục các request bị từ chối.
2. B mở chat nhóm: thử tương tự `CHAT_PEOPLE_GET_MES`, dự phòng `GET_ROOM_CHAT_MES`.
3. A gửi tin B, B nhận ngay; B phản hồi A; F5 cả hai máy; kiểm tra tin còn và không bị trùng. Nếu server không lưu/tải lịch sử, báo rõ hạn chế thay vì coi là đã sửa thành công.
4. Gửi emoji, ảnh, video; nhận file trên máy khác. Kiểm tra URL không trỏ `127.0.0.1` ở phía người nhận.
5. Chọn một nhóm → Thông tin nhóm → tìm thành viên, Nhắc tên, gửi tin có `@username`.
6. Sao chép tên nhóm; tài khoản B tham gia nhóm qua tên, gửi tin, rời nhóm.
7. Mở chat → Công cụ → Tìm kiếm/Đã lưu/Ảnh & tệp/Chọn nhiều. Đóng mở Công cụ và đổi hội thoại, kiểm tra chỉ một thanh công cụ hiển thị mỗi hội thoại.
8. Cố gửi khi mất mạng: lỗi hiển thị trong ô soạn tin, có thể đóng; nháp không tự mất.
9. Cài đặt → Quyền riêng tư → cấp quyền thông báo → Lưu. Đưa tab A về nền rồi B gửi tin. Khi đã cấp quyền, A nhận thông báo không lộ nội dung.
10. Xác minh chủ phòng không rời nhóm nếu server từ chối; đăng xuất không tự khôi phục trái phép.

## Kiểm thử tự động và giới hạn

- `npm test`: 191/191 đạt (gồm bốn test mới về lịch sử phiên bản cũ/mới, tìm thành viên không dấu, chính sách thông báo).
- `tsc -b --pretty false`: đạt trong môi trường kiểm tra.
- `npm run build` và `npm run lint`: chưa xác nhận, do bộ `node_modules` ZIP kèm binary/thiếu gói trên Linux. Chạy `npm ci` sạch trên Windows rồi kiểm tra lại.
- Không thể kiểm thử end-to-end API production khi không có tài khoản thử của giảng viên. Không có kiểm chứng rằng server thật hỗ trợ event dự phòng; cần test checklist phía trên.
