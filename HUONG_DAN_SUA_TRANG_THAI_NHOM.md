# Sửa trạng thái tải lịch sử nhóm

- `src/components/MessageList.tsx`: hiển thị duy nhất một trạng thái: đang tải, lỗi, hoặc chưa có tin. Khi lỗi `ACTION_NOT_EXIT`, không hiện nút Thử lại vô ích.
- `src/App.css`: căn giữa thông báo khi chưa có nội dung, thay vì rải nhiều vị trí theo chiều dài khung chat.
- Không sửa event `CHAT_PEOPLE_GET_MES`, không giả lập lịch sử nhóm và không tự nhận rằng backend đã sửa.

## Kiểm tra

1. `npm install` rồi `npm run dev:full`.
2. Mở nhóm `room_345`, kiểm tra chỉ có một trạng thái tải/lỗi.
3. Nếu server vẫn trả `ACTION_NOT_EXIT`, đó là lỗi API phía server từ chối event, không có dữ liệu lịch sử để hiển thị.
4. Mở nhóm khác và chat cá nhân, kiểm tra tin mới, emoji, ảnh vẫn hoạt động như cũ.
5. Chạy `npm test` để chạy hồi quy.

**Lưu ý:** 207 bài test nội bộ đạt; chưa chạy được build trình duyệt do source không kèm node_modules và chưa kiểm thử kết nối thật.
