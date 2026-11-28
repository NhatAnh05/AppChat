# P1 Hotfix — gửi ảnh/tệp, lịch sử nhóm, tin trùng và bố cục

Áp dụng **sau** `LyraChat-P1-ban-va.zip` trên bản đã hoàn thành P0. Không thay đổi package.json/package-lock.json. Không ghi đè uploads hoặc dữ liệu Git. Giữ nguyên giới hạn production: 25 MiB/tệp, 10 lượt upload đồng thời, không quota lưu trữ mỗi tài khoản/tổng, rate limit 10 POST/phút và 120 GET/phút mỗi tài khoản.

## 1. Kiểm thử media trên cùng máy (không phải production)

Dừng lần chạy cũ (Ctrl+C), rồi:

```powershell
npm run dev:full -- --local-media
```

Mở URL localhost mà Vite in ra, đăng nhập hai tài khoản thử ở hai hồ sơ trình duyệt khác nhau trên **cùng máy**. Chỉ dùng ảnh và tài liệu mẫu không nhạy cảm. Chế độ này cố ý **không xác thực danh tính tài khoản giảng viên**: upload chỉ qua Vite loopback đã cấp khóa nội bộ ngẫu nhiên, file lưu riêng trong `server/uploads-local/`, và download yêu cầu URL capability ngẫu nhiên được cấp cho từng file. Bất kỳ ai biết capability và truy cập được localhost đều có quyền đọc file mẫu đó. Không bật LAN/tunnel/reverse proxy Internet; không chia sẻ URL capability. Upload local áp dụng rate limit chung cho workspace local, không phải theo tài khoản giảng viên. Khóa nội bộ chỉ ở tiến trình Node/Vite, không đặt trong VITE_*; biến VITE_LYRA_LOCAL_MEDIA chỉ là cờ chọn chế độ.

Kiểm tra health (dùng đúng cổng Vite đang chạy):

```powershell
Invoke-RestMethod http://localhost:5173/api/media/local/health
```

Kỳ vọng `ok: true`, `mode: local-sandbox`. Sau khi upload, đường dẫn mới dùng `/api/media/local/files/...?...` và metadata tên, kích thước tệp được gửi trong trường `mes` dạng text; ứng dụng khác không hỗ trợ định dạng có thể thấy JSON thô. Mở hội thoại cá nhân và nhóm, gửi PNG/JPG/PDF/DOCX/XLSX và thử tải tệp ở hồ sơ thứ hai. Vite có thể chọn cổng khác nếu 5173 đã bận; dùng cùng cổng cho hai hồ sơ.

**Không dùng `--local-media` khi triển khai thật.** `npm run dev:full` bình thường vẫn khóa media nếu không có gateway xác thực. Để gửi tệp giữa nhiều máy cần dịch vụ HTTPS cùng origin, xác thực tài khoản và kiểm tra membership đáng tin cậy trước khi ký HMAC theo `docs/P0-FIX.md`. API Excel không có hợp đồng xác thực media riêng; bản hotfix không giả mạo quyền hay đưa secret vào client. Tệp localhost cũ không thể tự chuyển thành link Internet, và file cũ không có metadata/ACL không được mở công khai. Giữ bản sao thư mục `server/uploads` cũ; nếu cần, gửi lại tệp mẫu qua luồng upload mới. Không có API chỉnh sửa URL trong lịch sử đã lưu để thay đường dẫn cũ. Ảnh/video lỗi có fallback; tệp same-origin báo lỗi tải thay vì tải response lỗi dạng JSON.

## 2. Lịch sử nhóm

- Giữ event tương thích mặc định `GET_ROOM_CHAT_MES`; nếu timeout thì chỉ thử `CHAT_PEOPLE_GET_MES` (Excel hàng 11) một lần trên **socket mới đã RE_LOGIN**. Không retry SEND_CHAT. Phản hồi socket cũ không được gán vào request mới.
- Nếu hai event thất bại: tạm ngưng polling tự động 120s sau timeout, không spam; phản hồi ACTION_NOT_EXIT cả hai event dừng tự động tới khi đổi phiên.
- Nhận envelope lồng `data`, chuẩn hóa kiểu 1/"1"/"room" và id thành viên dạng chuỗi số; phản hồi sai tên nhóm vẫn bị từ chối. Không biến dữ liệu nhóm lỗi thành danh sách trống.
- Dữ liệu thành viên dùng chung kết quả page lịch sử trong Redux. Nút Thử lại yêu cầu đúng trang bị lỗi.
- Nếu nhóm vẫn lỗi, mở DevTools > Network > WS > Messages, kiểm tra request/response đã che token và nội dung riêng tư. Có thể dùng `VITE_CHAT_API_PROFILE=excel` trong `.env.local` rồi khởi động lại để ưu tiên event tài liệu. Chưa kiểm thử trên API thật.

## 3. Trùng tin và giao diện

- Stable ID dedup; ghép một-một tin live/ack với lịch sử. Nếu có nhiều bản ghi khác ID thì giữ nguyên.
- Local unconfirmed chỉ được liên kết **để hiển thị** khi có đúng một bản ghi cùng hội thoại/người gửi/người nhận/nội dung/thời gian, ID không nằm trong snapshot trước gửi và không được xác nhận bởi ACK khác. Bản local vẫn tồn tại trong state, không thay trạng thái thành confirmed. Nếu xuất hiện thêm ứng viên làm mơ hồ, bỏ liên kết. Nếu không đủ dữ liệu để đối chiếu, giữ riêng thay vì xóa tin thật.
- Chỉ một vùng cuộn với inner block normal flow, không paint containment. Duy trì scroll anchor khi tải trang cũ; theo đáy khi ảnh đổi chiều cao nếu người dùng đã ở gần đáy. Tách lỗi upload thành hàng riêng. Ảnh fit trong bubble; tệp mới có tên và dung lượng.
- Chưa thể xác định bản ghi trùng có ID khác nhau từ server có phải do gửi thật nhiều lần hay lỗi server; không tự xóa.

## 4. Kiểm thử trước push

```powershell
npm test
npm run build
npm run lint
npm audit
git status
```

Kiểm tra bằng hai tài khoản thật: gửi hai tin cùng nội dung, gửi tin vào nhóm, F5 và load nhiều trang, nhóm khi mạng mất rồi kết nối lại, trạng thái lỗi/đang tải/trống, chuyển nhanh hội thoại, rời nhóm trong lúc tải. Kiểm tra Chrome/Edge và zoom 80–125%. Sau đó mới push. Kiểm tra `git ls-files server/uploads server/uploads-local` và `git ls-files ".env*"` trước commit; không commit dữ liệu upload hoặc khóa.

Kết quả môi trường tạo bản vá: 250 test, 248 đạt, 0 fail, 2 skip (thiếu @reduxjs/toolkit). Kiểm tra kiểu các service đã sửa đạt bằng tsc 5.8.3 và declaration môi trường Vite tối thiểu; full build thiếu vite/client và @types/node, ESLint không cài. HTTP test chạy server thực cục bộ, WS dùng mock. Fixture CSS với 24 hàng tin, ảnh, composer error trên Chromium ở 1648x900, 1280x720, 768x800 và 390x844 không overlap, không tràn viewport, ảnh nằm trong bubble. Không phải test React/Edge E2E. Kiểm tra lại trên máy Windows của bạn trước khi đóng P1.
