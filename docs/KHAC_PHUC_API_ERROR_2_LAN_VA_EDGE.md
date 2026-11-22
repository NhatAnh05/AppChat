# Khắc phục ACTION_NOT_EXIT hai lần và hiện tượng cuộn/vẽ lại trên Edge

## Nguyên nhân quan sát trong bản AppChat(4)

Nhật ký WebSocket của server hiện tại ghi `CHAT_PEOPLE_GET_MES → ACTION_NOT_EXIT`, rồi `GET_PEOPLE_CHAT_MES → success`. Tương tự, `CHAT_CHECK_USER_ONLINE → ACTION_NOT_EXIT`, rồi `CHECK_USER_ONLINE → success`. Hai dòng lỗi đến từ hai lần dò sự kiện không được server triển khai, **không phải lỗi của lần gọi cuối cùng**.

## Điều chỉnh

- Với lịch sử **cá nhân**, thử `GET_PEOPLE_CHAT_MES` trước, sau đó mới `CHAT_PEOPLE_GET_MES` nếu bị từ chối. Lịch sử **nhóm** vẫn ưu tiên `CHAT_PEOPLE_GET_MES` vì chưa có bằng chứng đủ về alias của phòng trên production.
- Với Online, thử `CHECK_USER_ONLINE` trước, sau đó mới `CHAT_CHECK_USER_ONLINE` nếu bị từ chối. Chỉ fallback khi nhận `ACTION_NOT_EXIT`, không thử lại khi timeout/lỗi mạng.
- Vẫn giữ tuần tự hóa yêu cầu từ bản trước, tránh nhận nhầm phản hồi khi server không có requestId.
- Chuyển danh sách tin nhắn sang luồng block và tạo giới hạn vùng vẽ/scroll ở phần CSS để giảm hiện tượng scrollbar và vùng chat bị vẽ thành nhiều dải trên Edge. Không thêm thanh công cụ mới.

## Kiểm tra trong WebStorm

1. Giữ nguyên `.git`, sao lưu source, sao chép file mới, dừng Vite cũ và chạy `npm ci`, `npm test`, `npm run build`, `npm run dev:full`.
2. Mở Edge `http://localhost:5173/chat`, làm mới mạnh `Ctrl+Shift+R`.
3. Chọn hội thoại TuyetMinh, mở Nhật ký API: trên máy chủ đúng như ảnh, yêu cầu lịch sử đầu tiên phải là `GET_PEOPLE_CHAT_MES` và Online đầu tiên phải là `CHECK_USER_ONLINE`. Không còn hai lần dò lỗi trước một phản hồi success.
4. Cuộn lịch sử dài/ảnh và đổi qua lại hai hội thoại, kiểm tra từng tin có đủ chiều cao và chỉ một thanh Công cụ.
5. Nếu Edge vẫn xuất hiện vệt ảnh ảo trong khi số element DOM chỉ có một, thử tắt tăng tốc đồ họa ở Edge Settings → System and performance → Use graphics acceleration when available (nếu có) rồi khởi động lại Edge để phân biệt lỗi renderer/GPU với React.

**Giới hạn:** Các bài test WebSocket sử dụng socket giả; tình trạng server production phải xác nhận bằng chính tài khoản của người dùng. Kiểm tra bố cục tĩnh bằng Chromium với 90 hàng tin trên các chiều rộng 1600, 1024 và 760 px không phát hiện hàng tin chồng nhau.
