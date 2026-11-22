# Tối ưu tốc độ mở lịch sử tin nhắn

## Nguyên nhân

`App.tsx` trước đây dispatch `fetchPeopleChatHistory` cho **mọi liên hệ** ngay khi danh bạ thay đổi. Trong khi đó `peopleChatService.ts` tuần tự hóa `GET_PEOPLE_CHAT_MES` bởi server không cung cấp request ID. Chọn một người ở cuối danh sách khiến yêu cầu của người đó phải chờ toàn bộ các yêu cầu đã xếp hàng, có thể mất nhiều phút khi server trả lời chậm.

## Đã thay đổi

- Bỏ tự tải lịch sử cho tất cả bạn bè khi đăng nhập / khi trạng thái online được cập nhật.
- `ChatWindow` chỉ yêu cầu trang lịch sử đầu tiên khi chọn hội thoại; các trang đã tải tiếp tục được giữ trong Redux khi chuyển qua lại.
- Nút làm mới chỉ tải lại cuộc trò chuyện được chọn (vẫn làm mới danh bạ), không bắt xếp hàng toàn bộ danh bạ.
- Đồng bộ dự phòng cuộc trò chuyện đang mở mỗi 10 giây thay vì 4,5 giây để giảm số lần gọi API và xếp hàng.
- Thử lại khi lần tải đầu lỗi luôn yêu cầu trang 1.

## Giới hạn

Nếu backend phản hồi `GET_PEOPLE_CHAT_MES` chậm, trình duyệt không thể tăng tốc xử lý bên server. Có thể kiểm tra bằng **Nhật ký API**: đối chiếu thời điểm gửi `GET_PEOPLE_CHAT_MES` và khi nhận phản hồi. Cần test với 2 tài khoản thật để kiểm tra thời gian tải và khả năng nhận realtime.

Việc bỏ tải toàn bộ lịch sử lúc đăng nhập đồng nghĩa preview tin nhắn của các hội thoại chưa mở sẽ chỉ xuất hiện sau khi lịch sử từng hội thoại được tải; đây là đánh đổi có chủ đích để ưu tiên chat đang mở.
