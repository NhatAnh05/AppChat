# P2 Hotfix 3 – Ghi âm

Áp dụng sau P2 Hotfix 2. Không thay đổi API giảng viên, giới hạn lưu trữ, 10 upload đồng thời hoặc xác thực. Dừng cả Vite và Media Server rồi ghi đè các tệp trong ZIP, khởi động lại dev:full -- --local-media --port 5174 --strictPort, MEDIA_PORT=8788.

## Thay đổi
- Đo dữ liệu do MediaRecorder tạo ra bằng OfflineAudioContext, không chỉ đo microphone. Nếu microphone có tín hiệu nhưng bản giải mã gần như im lặng, chặn tạo bản ghi gửi và yêu cầu thử lại. Tín hiệu thấp ở cả hai nguồn vẫn có cảnh báo và người dùng có thể nghe thử.
- Chuyển bản ghi mới sang PCM16 WAV mono 24 kHz, có kích thước và thời lượng xác định trong header. Chọn kênh có RMS lớn nhất, không cộng hai kênh lệch pha. Không khuếch đại tự động. 120 giây ghi âm ~5,76 MB (chưa gồm header); giới hạn kỹ thuật phần giải mã là 125 giây để dung nạp metadata/độ trễ codec. Server chỉ nhận WAV PCM16 mono 24 kHz cấu trúc chuẩn do recorder tạo, không mở rộng tùy ý mọi kiểu WAV. WebM/M4A cũ vẫn được hỗ trợ, không tự sửa các tệp im lặng đã lưu.
- Sau upload audio ghi âm, đọc lại đúng URL cùng origin, kiểm tra MIME, kích thước và từng byte trước khi SEND_CHAT. Nếu lỗi, giữ bản nghe thử để người dùng quyết định; không tự gửi lại. Có thể để lại tệp đã upload nếu kiểm tra thất bại. Tốn thêm một lần đọc tệp, không tăng quota/giới hạn đồng thời. Các tệp audio chọn bằng nút đính kèm thông thường vẫn theo quy trình file hiện có.
- Thêm nút tải ghi âm nội bộ để thử phát bằng trình phát Windows. Không thay đổi cơ chế cấp quyền.

## Kiểm thử
- 291/291 test, 0 fail, 0 skip trên Node 22.16.0. TypeScript và ESLint sạch. 4 test mới bao gồm WAV PCM, chọn kênh và RMS, kiểm tra byte/metadata, HTTP upload và range với kiểm tra quyền.
- Chromium thử component ghi âm/preview bằng oscillator và tín hiệu im lặng: thời lượng 1,32s, phát đến khoảng 0,4s, RMS đầu ra ~0,2121 với tín hiệu và 0 với im lặng. Không có lỗi JS. Track microphone đã dừng. Không phải microphone vật lý.
- Lượt chạy qua HTTP trong Chromium bị ERR_BLOCKED_BY_ADMINISTRATOR. Chưa xác nhận phát từ Media Server trực tiếp trên trình duyệt; HTTP thực tế được kiểm tra riêng bằng Node. Build Vite cần chạy trên Windows do binding Rolldown của ZIP nguồn là Windows.

## Kiểm tra trên Windows
1. npm.cmd test; npm.cmd run lint; npm.cmd run build; npm.cmd audit.
2. Ghi âm mới 5–10 giây, nghe thử. Nếu không có tiếng ngay khi nghe thử, kiểm tra Output/Volume mixer của Edge, Windows Sound Recorder, đúng microphone; gửi thông báo lỗi cụ thể.
3. Gửi bản nghe thử có tiếng, nghe ở cả hai tài khoản. Nút Tải ghi âm tải file WAV, phát bằng Media Player để so sánh. Nếu file tải xuống có tiếng nhưng trình duyệt không có, kiểm tra tab/site mute, volume của audio và Windows Volume mixer.
4. Không chia sẻ URL media có mã cap. Nếu lỗi vẫn còn, gửi thời lượng và dung lượng file, kết quả nghe thử/trình phát Windows, HTTP status và Content-Type (che URL đầy đủ). Có thể dùng file ghi âm thử không chứa thông tin riêng tư.

Không sửa lỗi chatMess hoặc online trong bản này do chưa có response thật. Không xác nhận đã khắc phục nguyên nhân trên máy người dùng khi chưa chạy thực tế.
