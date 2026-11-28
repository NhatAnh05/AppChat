# P2 Hotfix 2 — ghi âm, trình xem media và chẩn đoán lịch sử nhóm

Áp dụng trên P2 Hotfix 1 (284 test). Chỉ ghi đè các tệp trong ZIP; không thay đổi dependencies, cấu hình Media Server, gateway hay giới hạn P0.

## Ghi âm
- `useVoiceRecorder` kiểm tra track live/enabled, hiển thị tên microphone đang sử dụng, thời gian và mức RMS từ Web Audio (không phát tín hiệu microphone ra loa).
- Meter lấy mẫu mỗi 100 ms, RMS lớn nhất dưới 0.003 được cảnh báo là tín hiệu rất thấp. Đây là ngưỡng heuristic, không phải bộ nhận dạng lời nói. Nếu AudioContext không chạy hoặc không có mẫu, hiển thị chưa kiểm tra được tín hiệu, không khẳng định im lặng.
- Xử lý mute/unmute/ended; giải phóng track, AudioContext, interval khi dừng/hủy/đổi hội thoại/phiên.
- `VoicePreview` phát tệp cục bộ qua blob URL trước upload, thu hồi URL khi không còn sử dụng. Người dùng có thể nghe thử, hủy hoặc gửi; cảnh báo không tự động xóa hay gửi bản ghi.
- Không tăng thời lượng 120 giây, giới hạn 25 MiB hoặc upload đồng thời 10.

### Kiểm tra trên Windows/Edge
1. Settings > System > Sound > Input: chọn đúng microphone, nói và kiểm tra thanh mức tín hiệu. Kiểm tra microphone vật lý không bị mute.
2. Settings > Privacy & security > Microphone: bật quyền microphone và ứng dụng desktop. Trong Edge, kiểm tra quyền site `http://127.0.0.1:5174` và microphone mặc định.
3. Ghi 5–10 giây, nói rõ. Quan sát meter và tên microphone. Dừng và nghe lại bản ghi ngay trước khi gửi.
4. Nếu preview không có tiếng, kiểm tra đầu vào hoặc thiết bị phát. Nếu preview có tiếng nhưng tin đã gửi không có tiếng, kiểm tra audio phía người nhận, âm lượng và response HTTP media (không chia sẻ URL có cap). Không gửi lại nhiều lần nếu lịch sử đã có tin.

## Media Viewer
- Click ảnh/GIF trong bong bóng mở dialog trong ứng dụng; điều hướng các ảnh/GIF trong cùng album bằng nút, thumbnail hoặc ArrowLeft/ArrowRight; Escape đóng.
- Zoom 50–400%, xoay 90 độ, đặt lại, toàn màn hình nếu browser hỗ trợ, tải ảnh gốc qua fetch. URL nội bộ giữ nguyên capability; không điều hướng tab khi mở ảnh bình thường. Tệp ngoài origin có thể cần CORS để tải qua fetch. Fallback media lỗi vẫn có nút mở tệp cũ.
- Video/audio giữ native controls; không thay đổi định dạng album.

## Lịch sử nhóm
- Chỉ bổ sung tương thích cho `chatMess` là chuỗi JSON chứa mảng hoặc wrapper chính xác `{data: [...]}`. Mọi record vẫn qua xác minh tên nhóm, phạm vi, loại, ID và metadata bắt buộc.
- Không xem `null`, thiếu trường, JSON lỗi, object tùy ý là lịch sử trống. Không thay đổi JOIN/CREATE/OUT hay tự cấp quyền thành viên.
- Khi thất bại ở `chatMess`, nhật ký API có thêm code `room-history-rows-missing`, `room-history-rows-null`, `room-history-rows-string`, `room-history-rows-object` hoặc `room-history-rows-other`; không ghi dữ liệu tin nhắn hay credential.
- Chưa có response thật của nhóm Ăn Uống; không xác nhận hai dạng tương thích trên chính là định dạng server đang dùng. Online/Offline và gửi nhận nhóm cần dữ liệu thật để xác minh; không tạo online hoặc ACK giả.

## Kiểm thử
- `node --experimental-strip-types --test tests/*.test.mjs`: 287/287 pass, 0 fail, 0 skip. 3 test mới (RMS, cấu trúc lịch sử, wiring preview/viewer).
- `tsc -b` và ESLint: exit 0. Vite build Linux bị chặn vì thiếu native binding Rolldown (dependencies Windows trong nguồn).
- Kiểm tra Chromium bằng component React/hook thật trong harness: chuyển ảnh bằng mũi tên, zoom, Escape; hai luồng audio tổng hợp Web Audio (tone và silence) qua MediaRecorder, giải mã file bằng AudioContext. Tone RMS ~0.212, silence gần 0, cảnh báo đúng, track ended, không pageerror. Không phải microphone vật lý, chưa kiểm thử gửi bản ghi thực tới server giảng viên hay download/fullscreen toàn bộ viewer.
- Trên Windows: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd audit`.
- Chạy WebStorm: `dev:full`, Arguments `-- --local-media --port 5174 --strictPort`, Environment `MEDIA_PORT=8788`. Local media chỉ dùng trên cùng máy với dữ liệu mẫu.
