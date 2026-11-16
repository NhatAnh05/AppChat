# AppChat — Sửa lỗi thông báo tin chưa đọc (API 1–5)

## Phạm vi

- Đã tách bộ đếm tin chưa đọc ra khỏi độ dài của lịch sử tin nhắn.
- Tin do chính tài khoản gửi không làm tăng badge.
- Mở hội thoại đang có tin chưa đọc sẽ xóa badge **chỉ của hội thoại đó**.
- Tin mới đến trong hội thoại khác sẽ tăng badge một lần.
- Khi hội thoại đang mở và cửa sổ trình duyệt có focus, tin đến được xem là đã đọc.
- Khi trang không focus/ẩn, tin đến vẫn chưa đọc; quay lại cửa sổ và xem hội thoại sẽ xóa badge.
- Tải lại lịch sử / dữ liệu từ WebSocket đã gặp trước đó không tạo thông báo trùng.
- Badge của mục **Tin nhắn** ở thanh bên hiển thị tổng tin chưa đọc, tối đa `99+`.
- Dữ liệu được lưu **cục bộ theo tài khoản** bằng `localStorage`; chỉ lưu hash/ID của tin, không sao chép nội dung tin nhắn.

## Các file thay đổi

- `src/App.tsx`: đối chiếu tin mới, đánh dấu đọc, kết nối WebSocket/Redux.
- `src/components/Sidebar.tsx`: badge ở menu Tin nhắn.
- `src/components/ChatItem.tsx`: giới hạn hiển thị `99+`.
- `src/App.css`: badge của menu, hỗ trợ màn hình hẹp.
- `src/services/unreadNotifications.ts`: module thuần để quản lý bộ đếm, chống trùng, lưu trạng thái.
- `tests/unreadNotifications.test.mjs`: 10 test mới.

## Giới hạn

Các API 1–5 được cung cấp chưa có sự kiện server **MARK_AS_READ / READ_RECEIPT**. Do đó trạng thái đã đọc chỉ đồng bộ trong trình duyệt trên thiết bị hiện tại; không thể bảo đảm đồng bộ đa thiết bị. Khi mới bật tính năng lần đầu, dữ liệu lịch sử hiện có được lấy làm mốc ban đầu, không phát thông báo cho từng tin cũ. Không thay đổi giao thức API của giảng viên.

## Kiểm tra

```powershell
npm ci
npm run test:api
npm test
npm run build
```

Test chuyên biệt:

```powershell
node --experimental-strip-types --test tests/unreadNotifications.test.mjs
```

Kiểm thử thực tế: đăng nhập tài khoản A, nhờ B gửi hai tin; ở A badge tăng 2, mở hội thoại B badge về 0; gửi tin từ A badge vẫn 0; khi mở chat C rồi B gửi tin mới, badge B tăng 1 và badge Tin nhắn tăng 1; F5 và làm mới lịch sử không tăng thêm.
