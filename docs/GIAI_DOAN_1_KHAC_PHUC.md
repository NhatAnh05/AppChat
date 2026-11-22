# LyraChat — Giai đoạn 1: Ổn định nhắn tin

## Nguồn đối chiếu

- Source gốc: `AppChat-main (5)(1).zip` (ngày 18/11/2026).
- Tài liệu: `API_Chat_WebSocket_Tu_Anh.xlsx` (sheet `API WebSocket`, `Lưu ý`).
- Endpoint mặc định: `wss://chat.longapp.io.vn/chat/chat` (có thể thay bằng `VITE_CHAT_WS_URL`).

## Thay đổi đã thực hiện

1. **Đúng event lịch sử:** Cả tin nhắn cá nhân và nhóm gửi `CHAT_PEOPLE_GET_MES` như tài liệu. Phản hồi lỗi nhóm `GET_ROOM_CHAT_MES` vẫn được chấp nhận theo ghi chú không nhất quán của tài liệu.
2. **Hàng đợi lịch sử dùng chung:** Vì phản hồi server không có request ID, yêu cầu lịch sử cá nhân/nhóm thực hiện tuần tự và kiểm tra cấu trúc phản hồi, tránh nhận nhầm lịch sử giữa hai loại chat.
3. **Xác nhận SEND_CHAT chặt chẽ:** Tin nhắn cá nhân chỉ được xác nhận nếu phản hồi chứa người nhận và nội dung trùng yêu cầu. ACK không có định danh sẽ không tự được coi là thành công; thay vào đó kiểm tra lịch sử. Chat nhóm và cá nhân dùng chung hàng đợi gửi để giảm nhầm ACK.
4. **Trạng thái gửi:** Hiển thị `Đang gửi`, `Chưa xác minh đã gửi` hoặc `Gửi thất bại`; không tự động gửi lại tin khi không rõ server đã lưu hay chưa.
5. **Đối soát dữ liệu khi tải lại lịch sử:** Ghép tin tạm thời với bản ghi server theo nội dung, người gửi/người nhận và thời gian, tránh xuất hiện hai bong bóng cho cùng tin.
6. **Kết nối lại:** Khi WebSocket kết nối trở lại, hủy trạng thái cache lịch sử và tải lại cuộc trò chuyện đang mở.
7. **Quản lý phiên:** Redux không còn ghi `RE_LOGIN_CODE` hoặc `userId` xuống localStorage. Mã phiên vẫn được `sessionStore.ts` lưu vào sessionStorage và xoay vòng bằng RE_LOGIN.
8. **Emoji:** Giữ mã hóa/giải mã tương thích từ bản source gốc; thêm test văn bản kết hợp emoji và emoji phức hợp.
9. **Nhóm:** Lịch sử nhóm dùng event mới và được đối chiếu bằng tên phòng; luồng gửi nhóm dùng hàng đợi SEND_CHAT chung.

## Chạy bằng WebStorm

1. Giải nén và mở thư mục `AppChat-main`.
2. Mở terminal, chạy `npm install`.
3. Chạy `npm run dev:full` (gồm frontend và media server; máy cần Node.js tương thích Vite trong package.json).
4. Mở `http://localhost:5173/chat`.
5. Dùng **hai tài khoản khác nhau**, trên hai trình duyệt riêng hoặc cửa sổ ẩn danh. Không dùng cùng một sessionStorage.

## Kịch bản kiểm thử thủ công bắt buộc

| # | Bước thực hiện | Kết quả mong đợi |
|---|---|---|
| 1 | Tài khoản A gửi `Xin chào` cho B | B nhận; F5 vẫn có lịch sử |
| 2 | A gửi `😍` và `Xin chào 😍` | B thấy đúng cả chữ lẫn emoji |
| 3 | B trả lời A rồi A mất mạng 10 giây | Khi A có mạng, lịch sử được tải bù |
| 4 | A tạo/tham gia nhóm, gửi `Chào nhóm ❤️` | Thành viên thấy nội dung, F5 vẫn có |
| 5 | Gửi liên tục tin cá nhân và nhóm | Không lấy nhầm ACK và lịch sử |
| 6 | Đăng xuất, F5 | Không tự đăng nhập lại với mã phiên cũ |
| 7 | Mở DevTools > Application > Local Storage | Không có khóa `reLoginCode` được ghi bởi authSlice |
| 8 | Cố ý ngắt mạng ngay sau khi nhấn Gửi | Tin chưa xác minh có nhãn rõ ràng; không tự gửi lại |

## Kiểm thử tự động

`npm test` → **158/158 PASS** với Node.js v22.16.0 trong môi trường phân tích.

## Giới hạn và việc cần xác minh

- Chưa thể kiểm thử thực tế hai tài khoản trên API production trong môi trường đóng gói. Server có thể trả phản hồi khác tài liệu; dùng nút **Nhật ký API** để đối chiếu.
- API không có `clientMessageId`, vì thế phản hồi trễ và hai tin có nội dung giống nhau gửi sát nhau không thể được phân biệt tuyệt đối. Không báo `đã gửi` khi chưa có bằng chứng.
- Polling 4,5 giây của source gốc vẫn giữ để dự phòng server không broadcast; giai đoạn sau có thể tối ưu khi biết chắc server đẩy sự kiện đầy đủ.
- Hệ thống media và gọi thoại/video nằm ngoài phạm vi giai đoạn 1; không thay đổi.
- `npm run build` chưa chạy đầy đủ trong môi trường đóng gói do thiếu dependency trong bộ nhớ đệm npm (`npm ci --offline` thất bại). Cần chạy `npm install` rồi `npm run build` trên máy người dùng.
