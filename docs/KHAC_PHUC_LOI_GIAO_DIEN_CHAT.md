# Khắc phục lỗi bong bóng tin nhắn bị co, dồn và che nội dung

## Triệu chứng
- Tin đã gửi xuất hiện thành nhiều dải màu xanh mỏng, có tên người gửi và thời gian nhưng không nhìn thấy nội dung.
- Khi cuộn lịch sử dài, các tin văn bản và ảnh bị dồn hoặc đè lên nhau.
- Nội dung không co đúng chiều rộng trên màn hình nhỏ.

## Nguyên nhân và thay đổi
- `.message-list` là Flexbox theo cột. Trước đây `.message-row` chưa khai báo `flex-shrink: 0`; khi nhiều tin, trình duyệt có thể co các hàng gây cắt nội dung. Đã cố định `flex: 0 0 auto` và giữ chiều cao nội dung tự nhiên.
- Giới hạn chiều rộng bong bóng chat và ảnh/video để không tràn khỏi vùng hội thoại; văn bản dài xuống dòng.
- Bỏ qua bản ghi rỗng hoặc chỉ gồm khoảng trắng trong danh sách hiển thị; vẫn giữ trong Redux để không làm thay đổi dữ liệu server.
- Giữ nguyên WebSocket API, các thao tác gửi, nhận, reply và reaction.

## Kiểm tra trên WebStorm
1. Giải nén bản đã sửa, chép vào repository hiện tại nhưng giữ nguyên thư mục `.git`.
2. Mở Terminal tại thư mục có `package.json`, chạy `npm ci`, `npm test`, `npm run build`, `npm run dev:full`.
3. Dùng hai tài khoản và mở các cuộc chat có nhiều tin, tin dài, emoji, ảnh/video, reply.
4. Cuộn lên/xuống trong chat; mỗi tin có chiều cao riêng, không còn chỉ hiện dải màu và nội dung không bị chồng.
5. Thử kích thước cửa sổ hẹp và chế độ tối. Nhấn Ctrl+Shift+R nếu Vite còn giữ CSS cũ.

Đây là sửa lỗi giao diện cục bộ. Nếu trong lịch sử có tin bị mất nội dung thực sự, cần kiểm tra payload `mes` từ server riêng; CSS không khôi phục được dữ liệu server thiếu.
