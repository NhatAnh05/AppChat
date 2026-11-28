# P1 Hotfix 2 — trạng thái gửi, online, media và ổn định kết nối

## Phạm vi
- Không tạo ACK giả. Khi một bản ghi máy chủ được liên kết duy nhất với tin local chưa xác nhận (logic đối chiếu hiện có), chỉ ẩn banner của đúng lần gửi; nhãn dưới tin vẫn cho biết chưa có ACK. Nếu thiếu căn cứ, giữ cảnh báo.
- Kết quả online có timestamp. Hết hạn sau 180 giây (kiểm tra mỗi 15 giây hoặc khi focus), lỗi API và ngắt kết nối trở về trạng thái chưa rõ. Header có nút cập nhật thủ công; tiếp tục polling hội thoại đang mở mỗi 120 giây, không quét toàn bộ danh bạ. Không suy đoán online từ lịch sử.
- Các thao tác WebSocket xác thực thông thường (gửi, lịch sử, kiểm tra người dùng, danh bạ và nhóm) sử dụng chung hàng đợi theo phiên. Chủ động phục hồi kênh không còn cắt ngang yêu cầu khác đang chờ trong hàng đợi này. Hủy tải lịch sử phòng trước khi xếp yêu cầu rời phòng; chỉ xóa nhóm khi server xác nhận OUT_ROOM. Nếu rời thất bại có thể tải lại lịch sử. Việc tuần tự hóa có thể tăng thời gian chờ trong lúc API timeout. Logout/đổi tài khoản và mất mạng vẫn được phép ngắt các yêu cầu.
- URL media thử nghiệm cũ có đường dẫn đúng cấu trúc local và capability hợp lệ về hình thức được đổi origin sang localhost hiện tại khi bật chế độ thử nghiệm. Giữ nguyên đường dẫn và mã truy cập; máy chủ vẫn xác thực mã. Không sửa lịch sử server, không tự cấp quyền tệp cũ, không thay URL production.
- Tương thích tin media cũ gắn nhãn file: JPG/PNG/WebP/AVIF, GIF, MP4/WebM/MOV được hiển thị đúng loại nếu phần mở rộng hợp lệ. Video thực tế còn phụ thuộc codec trình duyệt hỗ trợ.
- Khung ảnh/video sử dụng tỷ lệ nội tại, giới hạn 320px chiều rộng và 300px chiều cao; không ép 4:3. Điều chỉnh xử lý sự kiện cuộn phát sinh từ chính thao tác cuộn tự động. Thư viện Ảnh & tệp cũng dùng URL localhost đã xử lý.

## Áp dụng
Giải nén các tệp vào thư mục gốc AppChat, không xóa server/uploads hoặc server/uploads-local.

```powershell
cd "D:\Desktop\AppChat"
npm.cmd test
npm.cmd run build
npm.cmd run lint
npm.cmd audit
```

WebStorm: dùng cấu hình npm dev:full, Arguments `-- --local-media --port 5174 --strictPort`, Environment `MEDIA_PORT=8788` nếu vẫn sử dụng hai cổng này. Dừng tiến trình cũ trước khi chạy. Không bật nhiều instance.

Hoặc PowerShell:

```powershell
$env:MEDIA_PORT = "8788"
npm.cmd run dev:full -- --local-media --port 5174 --strictPort
```

Mở `http://127.0.0.1:5174/chat`, Ctrl+F5. Kiểm tra health `http://127.0.0.1:5174/api/media/local/health`.

## Kiểm thử thực tế
1. Gửi văn bản, ảnh, GIF, video và tài liệu mẫu giữa hai tài khoản; nếu thiếu ACK nhưng có liên kết lịch sử, banner phải biến mất, trạng thái dưới tin vẫn trung thực. Không gửi lại tự động.
2. Kiểm tra hai tin giống nội dung liên tiếp và tải lại lịch sử; không được mất các ID server khác nhau.
3. Bấm cập nhật online; khi API lỗi hoặc mất mạng, trạng thái phải là chưa rõ, không tự gán offline.
4. Mở tệp thử nghiệm có URL từ 5173 bằng ứng dụng tại 5174; chỉ truy cập được nếu tệp và metadata capability còn tồn tại trong cùng thư mục lưu trữ. Mã sai vẫn phải bị chặn.
5. Xem ảnh dọc, ngang, vuông, GIF và video, cuộn lịch sử trong lúc ảnh tải; kiểm tra ở Edge/Chrome và màn hình nhỏ. Tải lịch sử nhóm, gửi nhóm, rời nhóm và reconnect.
6. Chạy các kiểm thử trước khi push. Giữ nguyên cơ chế bảo mật P0 và giới hạn upload đồng thời 10; không có thay đổi server/media-server.mjs.

## Giới hạn
- Bản vá không xác minh được ACK thực tế, trạng thái online thật hay API nhóm giảng viên do không có phiên kiểm thử server thật.
- Local sandbox chỉ dùng tệp mẫu trên cùng máy, không phải xác thực người dùng production. Gateway production, chuyển đổi tệp cũ không có metadata, URL nhiều thiết bị, Docker/Nginx và HTTP Range chưa hoàn thiện. Không dùng local sandbox trên Internet.
- Những định dạng envelope media nhiều tệp, emoji, ghi âm và các công việc P2 khác chưa thuộc phạm vi bản vá này.
- TypeScript, ESLint và bộ test được chạy tại môi trường kiểm tra. Vite build trên Linux bị chặn bởi native binding Rolldown chỉ có bản Windows trong ZIP; cần xác minh build trên máy Windows. Kiểm tra Chromium desktop trước điều chỉnh cuộn cuối không có chồng hàng/tràn media; lượt kiểm tra lại sau điều chỉnh bị timeout nên phải kiểm tra cuộn thực tế.
