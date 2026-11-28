# P2 Hotfix 1 — lịch sử nhóm và album

## Cài đặt
Áp dụng sau `LyraChat-P2-dot-1.zip`. Chỉ ghi đè các tệp trong bản vá; không xóa thư mục upload. Cấu hình localhost giữ nguyên (`npm.cmd run dev:full -- --local-media --port 5174 --strictPort`, `MEDIA_PORT=8788`).

## Lịch sử nhóm
- Excel hàng 11 mô tả `name`, `user`, `chatMess`. Trước đây `parseRoom()` dùng chung thông báo lỗi tên nhóm cả khi `user` hoặc `chatMess` sai định dạng.
- Tách xác minh tên phòng, `chatMess`, từng bản ghi và metadata `user`. Chỉ nhận lịch sử đúng phòng, đúng loại và ID hợp lệ; phản hồi của phòng khác không giải quyết request đang chờ. Nếu lịch sử hợp lệ nhưng roster thiếu/hỏng, vẫn hiển thị lịch sử đã xác minh; roster không được giả thành mảng rỗng. CREATE/JOIN vẫn kiểm tra chặt, không tạo quyền thành viên mới; guard Redux tiếp tục yêu cầu phòng thuộc danh sách hiện tại và thêm kiểm tra username/chatId trùng nhau.
- Danh sách thành viên đã tải trước đó được giữ lại nếu lần cập nhật lỗi, có cảnh báo chưa cập nhật. Không hiện (0) khi chưa biết kết quả. Các trường roster không đúng hợp đồng Excel vẫn cần xác minh bằng phản hồi thật; không tự sinh ID.
- Nhật ký API ghi mã cố định `room-history-ok`, `room-history-name`, `room-history-data`, `room-history-rows`, `room-history-row-scope`, `room-history-row-invalid`, `room-history-members`, `room-history-rejected`, `room-history-timeout`. Không ghi tên phòng, thành viên hay nội dung tin vào các mã chẩn đoán mới.

## Album
- Hình ảnh/GIF liên tiếp: một ảnh riêng giữ tỷ lệ tự nhiên; album chia hàng theo số lượng (2, 3, 2+2, 2+3); hỗ trợ dữ liệu cũ tới 20 item, giữ thứ tự. Thumbnail cắt vừa khung; nhấn ảnh để mở ảnh gốc. Video/audio/tài liệu nằm hàng riêng, giữ điều khiển.
- Thanh công cụ gắn vào wrapper sát bong bóng, không phụ thuộc độ rộng trạng thái gửi; màn hình hẹp dùng toolbar trong luồng.
- Preview album tổng hợp theo số lượng/loại, giữ caption.

## Kiểm thử
- Node 22.16.0: 284/284 test, 0 fail, 0 skip. Thêm 7 test (6 test mới trong p2Hotfix1.test.mjs, 1 trong p1Regression.test.mjs). Hai test cũ được cập nhật để kiểm tra thông báo chính xác và preview mới.
- `node node_modules/typescript/bin/tsc -b --pretty false` và `node node_modules/eslint/bin/eslint.js .` đạt.
- Build Vite không xác minh được trên Linux: quyền executable và thiếu native binding Rolldown Linux trong dependencies Windows. Chạy lại trên máy Windows.
- Chromium React/Redux harness, 1648x900: 12 hàng, 10 album, 34/34 thumbnail tải được, 1 vùng cuộn, không tràn ngang/chồng hàng; không dư khoảng trống ngang giữa tile, toolbar cách bong bóng 7 CSS px. Các lượt độ phân giải khác bị timeout. Không kiểm thử server thật; các phản hồi khác hợp đồng là fixture giả lập.

## Kiểm tra trên Windows
```powershell
cd 'D:\Desktop\AppChat'
npm.cmd test
npm.cmd run build
npm.cmd run lint
npm.cmd audit
```
Mở nhóm Ăn Uống, nhấn Thử lại và Thông tin nhóm > Làm mới, xem nhật ký API nếu còn lỗi; gửi tin nhóm bằng hai tài khoản. Thử 2–5 ảnh/GIF, album hỗn hợp video/tệp, nhấn xem ảnh gốc và mở công cụ. Kiểm tra trên Edge và màn hình hẹp. Giữ nguyên bảo mật media, không giới hạn dung lượng lưu trữ tổng/mỗi tài khoản, 10 upload đồng thời. Không thay đổi dependencies, API giảng viên, gateway production hoặc Media Server.
