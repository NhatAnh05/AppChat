# Giai đoạn 2 – Tiện ích nhắn tin LyraChat

> Bản này kế thừa đầy đủ sửa lỗi lịch sử WebSocket, gửi/nhận hai chiều và an toàn phiên đăng nhập của **Giai đoạn 1**. Hai giai đoạn được gộp thành **một bản source**, chưa được commit hoặc push vào repository của người dùng.

## Chức năng mới

| Tính năng | Nơi thao tác | Ghi chú |
| --- | --- | --- |
| Tìm kiếm tin nhắn | Mở cuộc trò chuyện → thanh tìm trong tin | Không dấu/không phân biệt chữ hoa, chỉ tìm những tin đã tải |
| Lưu tin | Di chuột lên tin nhắn → biểu tượng bookmark | Lưu theo tài khoản + hội thoại trên **trình duyệt hiện tại**, không đồng bộ giữa máy |
| Xem tin đã lưu | Tab **Đã lưu** ở đầu cuộc trò chuyện | Tin phải còn nằm trong lịch sử đã tải; tải thêm trang cũ nếu cần |
| Thư viện media | Tab **Ảnh & tệp** | Lọc ảnh/GIF, video, tệp; mở URL hoặc đi đến tin gốc; chỉ tin đã tải |
| Chuyển tiếp | Biểu tượng chuyển tiếp bên tin → chọn người/nhóm | Dùng `SEND_CHAT` cũ; chỉ báo thành công sau khi server xác nhận |
| Chọn nhiều | Tab **Chọn nhiều** → đánh dấu tin | Sao chép nhiều tin hoặc chuyển tiếp **tối đa 10** tin theo thứ tự |
| Bản nháp tự động | Nhập tin rồi chuyển hội thoại/F5 | Nội dung được lưu ở localStorage theo user/chat, xóa khi gửi thành công |
| Dán/kéo thả media | `Ctrl+V` ảnh, hoặc kéo file thả lên khung nhập | Sử dụng media server đã có và gửi URL qua `SEND_CHAT` |

## Những giới hạn cần trình bày khi nghiệm thu

- API giảng viên không có event tìm kiếm toàn bộ lịch sử, bookmark, chuyển tiếp hay lưu bản nháp. Tìm kiếm, bookmark và nháp là **tính năng frontend**; chuyển tiếp gửi lại qua `SEND_CHAT`.
- Tìm kiếm và thư viện chỉ quét các trang lịch sử đã tải. Không được gọi là tìm kiếm toàn bộ DB.
- Chuyển tiếp tập tin giữ nguyên URL media; máy nhận phải truy cập được URL đó. Với localhost trên máy khác, cần cấu hình media server công khai phù hợp.
- Chuyển tiếp nhiều tin thực hiện tuần tự để giữ thứ tự. Nếu lỗi sau một số tin, giao diện thông báo đã gửi bao nhiêu và chỉ giữ lại tin chưa gửi để retry, tránh gửi lại phần đã xác nhận.
- Mỗi lần xóa dữ liệu trình duyệt, các dấu bookmark/bản nháp lưu cục bộ có thể mất.

## Hướng dẫn chạy

```powershell
npm ci
npm test
npm run build
npm run dev:full
```

Mở `http://localhost:5173/chat` trên WebStorm. Đăng nhập hai tài khoản thật để kiểm tra WebSocket của giảng viên.

## Checklist kiểm thử thủ công

1. Đăng nhập A → mở chat B, gửi văn bản; B nhận; B trả lời; A nhận.
2. Tìm `chao` khi lịch sử có `Chào`, tìm theo username, xóa từ khóa.
3. Lưu một tin, chuyển tab **Đã lưu**, bỏ lưu; kiểm tra khi F5 và khi đổi tài khoản.
4. Chọn 2–3 tin, **Sao chép**, dán sang ứng dụng khác; xem đúng thứ tự/người gửi.
5. Chuyển tiếp 1 tin văn bản tới người khác và 1 tin tới nhóm; xác nhận ở phía nhận và sau F5.
6. Chọn nhiều tin → chuyển tiếp; khi mất mạng hoặc server từ chối, kiểm tra trạng thái lỗi và không nhân đôi tin đã được xác nhận.
7. Gửi hình ảnh từ máy A; vào **Ảnh & tệp**, chọn ảnh, mở tệp, nhấn **Xem tin**. Thử mở URL trên máy B.
8. Nhập nháp vào chat B, chuyển sang chat C rồi quay lại B; bản nháp phải còn. Gửi thành công thì nháp biến mất.
9. Dán ảnh bằng `Ctrl+V`, kéo ảnh/video/tệp vào ô soạn; kiểm tra xem media server đang chạy trước khi thử.
10. Thu nhỏ màn hình và bật dark mode; kiểm tra thanh công cụ và hộp thoại chuyển tiếp.
11. Chạy `npm test`, `npm run build` sau khi cài dependencies phù hợp trên Windows.

## Kiểm thử đã thực hiện trong môi trường phân tích

- Chạy toàn bộ bộ `npm test`: **187/187 thành công**, gồm 6 test tiện ích mới.
- `TypeScript tsc -b`: **đạt**.
- ESLint các file giao diện/tiện ích chỉnh ở Giai đoạn 2: không có error, còn 2 warning hook đã tồn tại ở ChatWindow.
- Vite build chưa xác nhận tại môi trường Linux vì bộ `node_modules` đi kèm trước đó chỉ có binary Rolldown dành cho Windows; cần `npm ci` rồi `npm run build` trên máy bạn.
- Chưa thực hiện kiểm thử end-to-end với hai tài khoản thật trên API production của giảng viên.
