# AppChat — Tích hợp API số 1 (REGISTER) và Docker

**Nguồn hợp đồng API:** `chat_API.xlsx`, sheet `0Sheet1`, hàng `REGISTER` (dòng 2).
**Phạm vi hiện tại:** Chỉ **REGISTER** kết nối WebSocket thật. Các màn hình chat và đăng nhập còn ở **chế độ demo**.

## 1. Địa chỉ và định dạng REGISTER

Endpoint WSS:

```text
wss://chat.longapp.io.vn/chat/chat
```

Client gửi frame WebSocket (JSON):

```json
{
  "action": "onchat",
  "data": {
    "event": "REGISTER",
    "data": { "user": "test_01", "pass": "123456" }
  }
}
```

Phản hồi thành công trong tài liệu:

```json
{ "status": "success", "event": "REGISTER", "data": "Creating account successful" }
```

Trùng tài khoản:

```json
{ "status": "error", "event": "REGISTER", "mes": "User already exists!" }
```

Tài liệu quy định `user` chỉ gồm chữ cái, số, dấu gạch dưới. Tài liệu **không** yêu cầu email hay tên hiển thị trong REGISTER. Backend chịu trách nhiệm mã hóa mật khẩu bằng BCrypt trước khi lưu vào DB. Frontend không lưu mật khẩu vào localStorage/sessionStorage.

## 2. File thực hiện

| File | Vai trò |
|---|---|
| `src/services/registerProtocol.ts` | Tạo gói REGISTER và đọc frame trả lời theo định dạng Excel |
| `src/services/authService.ts` | Mở WebSocket, gửi REGISTER, timeout và đóng kết nối |
| `src/pages/AuthPage.tsx` | Form username, password, xác nhận; thông báo kết quả thực tế |
| `src/App.tsx` | Giữ giao diện chat demo, đăng ký ở `/register`, vào demo ở `/login` |
| `src/vite-env.d.ts` | Kiểu biến môi trường Vite |
| `.env.example` | Mẫu địa chỉ WSS |
| `tests/registerProtocol.test.mjs` | Kiểm tra hợp đồng request và response không gọi mạng |
| `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `.dockerignore` | Docker multi-stage + Nginx |

**Không làm:** Không giả lập `status: success`, không gọi LOGIN/RE_LOGIN/LOGOUT thật, không kết nối chat realtime vào API. Tin nhắn được tạo trên giao diện là dữ liệu demo localStorage; nhãn đăng xuất dùng cho phiên demo, không gửi API LOGOUT.

## 3. Luồng người dùng

1. Vào `/register` hoặc nhấn **Đăng ký tài khoản bằng API REGISTER** từ màn hình đăng nhập demo.
2. Nhập username hợp lệ (ví dụ `test_01`), mật khẩu và xác nhận.
3. Nhấn **Đăng ký qua WebSocket**; nút khóa trong khi chờ.
4. `authService` gửi chính xác payload trong tài liệu; chỉ xử lý frame có `event: REGISTER`.
5. Server trả `success`: thông báo đăng ký được máy chủ xác nhận; **không tự động đăng nhập**, vì LOGIN chưa tích hợp.
6. Server trả `error`: hiển thị chính xác nội dung `mes`; khi kết nối hỏng/timeout, hiển thị lỗi rõ ràng.
7. Người dùng có thể chọn **Xem giao diện chat** ở chế độ demo, nhưng điều này KHÔNG phải phiên đã xác thực với máy chủ.

## 4. Chạy trực tiếp với WebStorm (Windows)

Mở thư mục chứa `package.json` trong WebStorm. Trong Terminal:

```powershell
npm ci
npm run test:register
npm run build
npm run dev
```

Truy cập địa chỉ Vite hiển thị (thường `http://localhost:5173/register`).

Nếu muốn đặt URL WSS khác trong máy cá nhân, tạo `.env.local` từ `.env.example` rồi sửa giá trị `VITE_CHAT_WS_URL`. File `.env.local` nằm trong `.gitignore`.

## 5. Docker Desktop + Docker Compose

Yêu cầu: Docker Desktop chạy với Engine và Compose (đã cài trên Windows); không cần mở Ubuntu để viết code. Đứng tại thư mục có `Dockerfile` và `docker-compose.yml`:

```powershell
docker --version
docker compose version
docker compose config
docker compose up -d --build
docker compose ps
```

- App chạy ở `http://localhost:8088`.
- Trang REGISTER: `http://localhost:8088/register`.
- `docker compose logs -f appchat` để xem lỗi container.
- `docker compose down` để dừng.

Docker build dùng Node.js 22 Alpine, chạy Nginx Alpine. Docker **chỉ chứa Frontend**, không có Backend/DB chat. Browser kết nối trực tiếp WSS đến máy chủ ngoài; Nginx không cần proxy WebSocket. Khi đổi Vite env, **build lại image** (`docker compose up -d --build`) vì env được đóng vào JS trong bước build.

## 6. Test cases tối thiểu

| TC | Thao tác | Kết quả mong đợi |
|---|---|---|
| REG-01 | Đăng ký username mới | Có frame `REGISTER`, máy chủ trả success |
| REG-02 | Đăng ký lại username | Máy chủ trả error, hiển thị `User already exists!` |
| REG-03 | Username có ký tự `@` | Chặn tại form, không gửi WebSocket |
| REG-04 | Xác nhận mật khẩu khác | Báo lỗi, không gửi WebSocket |
| REG-05 | Bỏ trống trường bắt buộc | Trình duyệt ngăn submit |
| REG-06 | Ngắt mạng | Hiển thị lỗi, không báo thành công giả |
| REG-07 | Server không phản hồi | Timeout sau 12 giây |
| REG-08 | Chạy Docker Compose | Container `Up`, mở `/register` thành công |

Trong Chrome `F12 → Network → WS → Messages` để quan sát frame. **Không chia sẻ ảnh/console chứa mật khẩu.**

Đã kiểm thử offline: unit test giao thức REGISTER (4 test) và TypeScript. **Chưa xác minh được phản hồi máy chủ bên ngoài**, không gọi API REGISTER thật trong quá trình đóng gói. Build Vite trong môi trường bàn giao bị thiếu thư viện native Rollup cho Linux; trên WebStorm/Docker chạy `npm ci` để cài thư viện theo hệ điều hành rồi build lại.

## 7. Giai đoạn kế tiếp

Sau khi kiểm thử REGISTER trên Backend thật, tích hợp `LOGIN`, `RE_LOGIN`, `LOGOUT` bằng một WebSocket session duy trì lâu dài (không tạo socket mới cho mỗi tin nhắn), rồi mới đến lấy hội thoại và gửi nhận tin nhắn. Không được dùng tài khoản demo như chứng chỉ đăng nhập Backend.
