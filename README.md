# LyraChat – React + TypeScript + WebSocket

Ứng dụng chat cá nhân và nhóm sử dụng API WebSocket do giảng viên cung cấp. Frontend là React + Redux Toolkit + Vite; media server là Node.js chạy cục bộ. Repo này **không chứa backend chat**.

## Khởi chạy trên WebStorm (Windows)

1. Giải nén dự án, mở **thư mục chứa `package.json`** bằng WebStorm.
2. Cài Node.js 22.12+ (khuyên dùng Node 22 LTS) và kiểm tra `node -v`, `npm -v`.
3. Trong Terminal chạy `npm ci` để cài theo `package-lock.json`.
4. Chạy `npm run dev:full` (Vite frontend + media server).
5. Mở `http://localhost:5173/chat` (nếu Vite hiển thị cổng khác, dùng cổng được in ra).

Các lệnh khác:

| Lệnh | Tác dụng |
|---|---|
| `npm test` | Chạy các bài test tự động với WebSocket giả lập |
| `npm run test:realtime:mock` | Chạy riêng các test lịch sử và gửi/nhận giả lập |
| `npm run build` | Kiểm tra TypeScript và build Vite |
| `npm run lint` | Kiểm tra ESLint |
| `npm run media` | Chạy riêng media server |
| `npm run test:realtime:live` | Thử gửi tin hai chiều trên server thật bằng hai tài khoản test |
| `npm run test:history:live` | Kiểm tra lịch sử trên server thật (chỉ đọc) |

## API và phiên đăng nhập

- WebSocket mặc định: `wss://chat.longapp.io.vn/chat/chat`; có thể đổi qua `VITE_CHAT_WS_URL`.
- Lịch sử người dùng và nhóm **đều gửi** `CHAT_PEOPLE_GET_MES`. Phản hồi **lỗi nhóm** có thể dùng `GET_ROOM_CHAT_MES` theo tài liệu API.
- Không có request ID cho lịch sử hoặc ACK gửi tin. Các yêu cầu được tuần tự hóa để hạn chế ghép nhầm, nhưng phản hồi muộn từ server vẫn là giới hạn giao thức.
- Mã `RE_LOGIN_CODE` được lưu trong `sessionStorage` theo tab, không còn lưu trong Redux hoặc `localStorage`. Frontend vẫn có nguy cơ XSS; khi triển khai công khai cần chính sách CSP và kiểm tra an toàn phụ thuộc.
- Tin nhắn, ảnh và nhóm cần **server thực** để lưu và đồng bộ. Media server localhost chỉ phục vụ tệp trong cùng máy nếu chưa có domain/proxy công khai.

## Kiểm tra gửi/nhận bằng hai tài khoản test

Mở hai cửa sổ trình duyệt (một thường và một ẩn danh), đăng nhập hai tài khoản khác nhau. A gửi B, B trả lời A, tải lại hai trang để kiểm tra lịch sử; thử tin có emoji, chat nhóm, mất mạng và đăng nhập lại. Chi tiết xem `docs/GIAI_DOAN_1_KHAC_PHUC.md`.

Để chạy script kiểm tra trực tiếp API mà **không sử dụng giao diện**, thiết lập bốn biến môi trường tại Terminal trước khi chạy `npm run test:realtime:live`:

```powershell
$env:CHAT_TEST_USER_A = "tai_khoan_A"
$env:CHAT_TEST_PASS_A = "mat_khau_A"
$env:CHAT_TEST_USER_B = "tai_khoan_B"
$env:CHAT_TEST_PASS_B = "mat_khau_B"
npm run test:realtime:live
```

Chỉ dùng tài khoản test được phép sử dụng. Không commit mật khẩu hoặc file `.env` chứa bí mật vào Git. Lệnh này sẽ thực sự gửi hai tin kiểm tra.

## Giai đoạn 2 – Tìm kiếm, lưu, chuyển tiếp và thư viện tin nhắn

Bản source này **đã gộp Giai đoạn 1 và Giai đoạn 2**, không cần cài thêm thư viện.

- Thanh tiện ích ở đầu cửa sổ chat: **Tin nhắn**, **Đã lưu**, **Ảnh & tệp**, **Chọn nhiều**.
- Tìm theo nội dung hoặc người gửi (hỗ trợ không dấu) trong lịch sử đã tải.
- Bookmark tin nhắn, chọn nhiều tin để sao chép hoặc chuyển tiếp tối đa 10 tin.
- Thư viện ảnh/GIF/video/tệp đã tải; có nút xem tin gốc và mở file.
- Bản nháp lưu theo từng tài khoản và hội thoại trên trình duyệt; hỗ trợ dán và kéo thả media.
- Chuyển tiếp tiếp tục dùng `SEND_CHAT`, **không bổ sung API giả**.

Xem hướng dẫn thử nghiệm và giới hạn: [docs/GIAI_DOAN_2_TIEN_ICH_TIN_NHAN.md](docs/GIAI_DOAN_2_TIEN_ICH_TIN_NHAN.md).

## Nâng cấp Giai đoạn 3–5 và sửa lỗi lịch sử

Xem [`docs/GIAI_DOAN_3_4_5_KHAC_PHUC.md`](docs/GIAI_DOAN_3_4_5_KHAC_PHUC.md) để biết các thay đổi, hướng dẫn chạy WebStorm và checklist test với hai tài khoản. Khi server báo `ACTION_NOT_EXIT`, frontend chỉ thử một tên event lịch sử dự phòng và dừng thử tự động nếu không hỗ trợ; chức năng lịch sử vẫn phụ thuộc máy chủ.

## Gọi thoại & video call WebRTC (local)

Chạy `npm run dev:full` để khởi động ứng dụng, media server và signaling server. Gọi 1-1 bằng các nút điện thoại / camera trên thanh tiêu đề chat. Xem [`HUONG_DAN_GOI_THOAI_VIDEO.md`](HUONG_DAN_GOI_THOAI_VIDEO.md) về kiểm thử, quyền micro/camera và điều kiện triển khai thực tế. Signaling demo không có xác thực danh tính; tuyệt đối không public nguyên trạng.
