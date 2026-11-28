# P1 Hotfix 3 – ACK, presence, media và chẩn đoán API

Áp dụng trên AppChat đã có P1 Hotfix 2. Chỉ ghi đè các tệp trong bản vá. Không xóa uploads hoặc uploads-local; giữ nguyên P0, gateway, 10 upload đồng thời và cấu hình lưu trữ. Không có thay đổi dependency.

## ACK và trạng thái gửi

API giảng viên Excel hàng 14 mô tả chuyển tin đến người nhận online, không cam kết một ACK riêng cho người gửi. Không suy ra ACK từ response lịch sử. Chỉ chấp nhận SEND_CHAT success có loại tin hợp lệ, đúng người gửi, đích, nội dung và không dùng lại ID đã biết; hỗ trợ một lớp data lồng. Timeout cá nhân giảm từ 10s xuống 4s (không đổi timeout nhóm và lịch sử). Không gửi lại tự động. Khi timeout, kênh gửi vẫn được cô lập; lần gửi sau phải có socket xác thực mới. Nếu tìm thấy bản ghi tương ứng theo quy tắc Hotfix 2, hiển thị 'Có trong lịch sử máy chủ'; tooltip vẫn ghi rõ thiếu ACK riêng. Đây không phải read receipt/delivery receipt. ACK đến sau 4s có thể không được dùng; độ trễ hàng đợi và tải lịch sử có thể cộng thêm.

## Online/Offline

Chấp nhận boolean đúng cấu trúc, kể cả data lồng; bỏ qua phản hồi có danh tính không khớp, từ chối boolean mâu thuẫn. Giữ event mặc định và fallback khi ACTION_NOT_EXIT. Không tự đổi false thành true. Sau khi nhận một tin realtime trực tiếp mới, ghi nhận riêng hoạt động nhận tin trong 180s; header có thể hiện 'Máy chủ báo ngoại tuyến' và 'Vừa nhận tin · trạng thái có thể khác thực tế'. Đây là bằng chứng nhận tin, không phải xác nhận người kia còn online. Cần kiểm thử API giảng viên.

## Nhật ký API trên header

Nhấn biểu tượng tài liệu (Nhật ký API), Xóa nhật ký, gửi 1 tin mẫu có nội dung duy nhất, đợi hiển thị lịch sử, nhấn nút cập nhật online. Mở nhật ký và chụp kết quả; nhật ký không ghi payload, mật khẩu, RE_LOGIN_CODE, đường dẫn capability hay nội dung tin. Các mã: ack-matched (đúng tuple), ack-incomplete (thiếu trường hoặc trạng thái), ack-replay (ID đã biết), ack-timeout (quá 4s), presence-true/false (giá trị API), probe-invalid, probe-other-user, probe-timeout. Frame chưa khớp khác hội thoại không được xem là ACK.

Script `npm.cmd run test:realtime:live` đã được nâng cấp để đo độc lập thời gian nhận tin và ACK sender trong 15s, báo số frame không khớp; có thể đặt CHAT_TEST_ONLINE_EVENT=CHECK_USER_ONLINE hoặc CHAT_CHECK_USER_ONLINE để đo thêm presence của A/B trong một lượt. Chỉ dùng hai tài khoản thử nghiệm có quyền, nhập thông tin thông qua biến môi trường CHAT_TEST_USER_A/PASS_A và CHAT_TEST_USER_B/PASS_B như tài liệu cũ. Không đưa mật khẩu vào chat, Git hoặc log. Dừng các phiên UI của tài khoản test trước khi chạy vì đăng nhập mới có thể ảnh hưởng phiên cũ; script gửi hai tin mẫu lên server thật. Chưa chạy script live trong môi trường đóng gói.

## UI

Media sử dụng width tính từ kích thước nội tại khi ảnh/video tải xong, tối đa 320x300 CSS px, padding nhỏ; tooltip người gửi/nhận chỉ ở metadata, không phủ toàn hàng. Giữ React key riêng. Memoize tập reaction khi dữ liệu không đổi. Không thay đổi giao diện tổng thể.

## Kiểm thử

- 267/267 test Node đạt, không skip; 9 test mới.
- TypeScript `tsc -b --force` và ESLint đạt.
- React/Redux fixture 45 tin, ảnh/GIF/MP4 giả lập: geometry đo 1648x900, 1280x720, 768x800, 390x844 trước khi thêm nút nhật ký: đúng 45 hàng và 1 viewport, không chồng/tràn, tổng khoảng dư ngang bubble/media đã tải tối đa 12 CSS px. Lượt desktop đo cuộn ban đầu không nhất quán khi ép tải ảnh eager; chưa xác nhận lại đầy đủ hành vi cuộn chậm/Edge. Không phải kiểm thử end-to-end với server thật.
- Vite build không hoàn tất ở Linux vì bản ZIP chỉ có Rolldown binding Windows. Build trên Windows theo hướng dẫn.
- Chưa đo heap/FPS hoặc độ trễ thực tế server; chưa xác nhận online và ACK thực tế, nhóm thật, gateway production hoặc media đa thiết bị. Không thay đổi cấu hình cổng hiện tại.

## Chạy trên Windows

```
cd "D:\Desktop\AppChat"
npm.cmd test
npm.cmd run build
npm.cmd run lint
npm.cmd audit
```

WebStorm: dev:full, Arguments `-- --local-media --port 5174 --strictPort`, Environment `MEDIA_PORT=8788`. Dừng phiên cũ, nhấn Run; vào http://127.0.0.1:5174/chat. Chỉ dùng local-media cho tệp mẫu trên cùng máy. Nếu cổng đang bị chiếm, xác minh PID trước khi dừng tiến trình cũ.

Kiểm thử hai tài khoản: văn bản, ảnh, GIF, MP4, tài liệu, gửi hai tin giống nhau, refresh, kiểm tra lịch sử nhóm, gửi/nhận nhóm, rời nhóm khi đang tải lịch sử, ngắt mạng rồi nối lại, chuyển tài khoản. Kiểm tra nhật ký ACK/presence và cuộn khi media tải chậm trước khi push.
