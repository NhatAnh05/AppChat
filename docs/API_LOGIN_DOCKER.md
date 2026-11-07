# AppChat — Giai đoạn 2: LOGIN (WebSocket) + Docker

## Phạm vi, trạng thái và nguồn

- **Đã triển khai code** cho `REGISTER` (API #1) và `LOGIN` (API #2), dựa trên `chat_API.xlsx`, sheet `0Sheet1`, dòng 2–3.
- Giao diện mặc định `/login`: form nhập **username** và **password**; `/register`: form đăng ký.
- **Chưa triển khai** `RE_LOGIN` (API #3), `LOGOUT` (API #4), lấy hội thoại, gửi/nhận chat qua server.
- Giao diện chat, tin nhắn và nhóm sau LOGIN vẫn sử dụng dữ liệu mẫu **localStorage**. Đăng nhập là xác thực thật, chat vẫn demo. Không coi chat demo là dữ liệu Backend.
- Đã chạy unit test cho 2 giao thức và kiểm tra TypeScript. Cần kiểm thử end-to-end với máy chủ thật trên máy người dùng.

## 1. API LOGIN — yêu cầu theo Excel

Endpoint WSS:

```text
wss://chat.longapp.io.vn/chat/chat
```

Request:

```json
{
  "action": "onchat",
  "data": {
    "event": "LOGIN",
    "data": { "user": "test", "pass": "123456" }
  }
}
```

Success:

```json
{
  "status": "success",
  "event": "LOGIN",
  "data": { "RE_LOGIN_CODE": "nlu_2055829137" }
}
```

Error:

```json
{
  "status": "error",
  "event": "LOGIN",
  "mes": "Login error, Wrong Username or Password"
}
```

`RE_LOGIN_CODE` là mã do Backend cấp, cần cho API #3. Giai đoạn này **chỉ giữ mã trong bộ nhớ của trang React** và không lưu mật khẩu hoặc mã vào localStorage/sessionStorage. Tải lại trang hoặc mất kết nối sẽ quay về `/login`; chưa có tự động RE_LOGIN.

## 2. Các file chỉnh sửa

| File | Vai trò |
|---|---|
| `src/services/registerProtocol.ts`, `authService.ts` | Giữ nguyên API REGISTER #1 |
| `src/services/loginProtocol.ts` | Tạo JSON LOGIN, đọc response thành công / sai thông tin / thiếu mã phiên |
| `src/services/loginService.ts` | Tạo socket, gửi LOGIN, chờ xác thực, giữ socket sau khi thành công, xử lý hủy / timeout / ngắt kết nối |
| `src/pages/AuthPage.tsx` | Trang mặc định LOGIN, chuyển REGISTER; chỉ báo thành công khi nhận phản hồi thật |
| `src/App.tsx` | Chặn truy cập chat trước LOGIN, xử lý mất kết nối và đóng phiên ở menu avatar |
| `tests/loginProtocol.test.mjs` | Unit tests giao thức LOGIN, không gọi mạng thật |
| `package.json` | Thêm `test:login`, `test:api` |
| `Dockerfile`, `docker-compose.yml`, `nginx.conf` | Giữ cách triển khai Frontend qua Nginx + Docker |

**Lưu ý về nút trong menu avatar:** `Đóng phiên trên thiết bị` gọi `disconnectLoginSession()` để đóng WebSocket và xóa trạng thái client. Nó **không gửi sự kiện `LOGOUT`**, vì API số 4 chưa được triển khai.

## 3. Luồng thao tác

1. Mở `http://localhost:8088/login` (hoặc địa chỉ Vite `/login`). Nếu chưa xác thực, truy cập `/` cũng hiển thị màn hình đăng nhập.
2. Chưa có tài khoản: nhấn **Đăng ký**, nhập username mới / mật khẩu / xác nhận. API #1 phải trả `REGISTER: success`; sau đó form chuyển về **Đăng nhập**.
3. Nhập username + password đã đăng ký. Frontend gửi `LOGIN` đúng payload Excel.
4. Nếu sai: hiển thị `mes` của Backend, giữ nguyên trang đăng nhập, không mở chat.
5. Nếu đúng và có `RE_LOGIN_CODE`: mở giao diện chat; WebSocket vẫn mở, chuẩn bị cho các API chat tiếp theo.
6. Menu avatar → **Đóng phiên trên thiết bị**: đóng WebSocket và trở về trang đăng nhập (chưa có LOGOUT từ máy chủ).
7. Mất kết nối: quay về đăng nhập, có thông báo; tự động khôi phục thuộc API #3.

## 4. Chạy trong WebStorm (Windows)

Trong thư mục chứa `package.json`:

```powershell
npm ci
npm run test:api
npm run build
npm run dev
```

Chạy Docker Desktop trước, sau đó:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
```

Trang đăng nhập: `http://localhost:8088/login`.

Docker **chỉ chạy Frontend**. Trình duyệt mở WebSocket tới Backend bên ngoài. Mỗi khi sửa code, chạy lại `docker compose up -d --build` để cập nhật kết quả build.

## 5. Test case giai đoạn 2

| Test | Thao tác | Kỳ vọng |
|---|---|---|
| LOG-01 | LOGIN với username, password đã đăng ký | Server trả success + mã phiên, vào giao diện chat |
| LOG-02 | LOGIN sai mật khẩu | Server trả error, không vào chat |
| LOG-03 | Username không hợp lệ / trống | Chặn tại form |
| LOG-04 | Máy chủ trả success nhưng thiếu mã | Báo lỗi, không cho vào chat |
| LOG-05 | Mất mạng / timeout khi LOGIN | Có thông báo, không cho vào chat |
| LOG-06 | Đóng phiên từ avatar | Ngắt socket, về LOGIN |
| LOG-07 | Tải lại trang sau LOGIN | Yêu cầu đăng nhập lại (vì chưa có RE_LOGIN) |
| LOG-08 | Docker build và truy cập `/login` | Container Up và hiển thị đúng form |

**Đây là các test case cần thực hiện trên máy thật, không phải kết quả PASS tự động.** Bài unit test chỉ kiểm tra tạo request và phân tích response từ dữ liệu mẫu, không xác nhận máy chủ đang hoạt động.

## 6. Giới hạn bảo mật/độ hoàn thiện

- Chưa tích hợp API `RE_LOGIN`, `LOGOUT`, và các API chat; không nhận thông tin hồ sơ người dùng từ Backend.
- Không nên gửi ảnh chụp Network WS chứa mật khẩu hoặc `RE_LOGIN_CODE` trong báo cáo.
- Lưu mã phiên trong bộ nhớ tạm, không lưu trên trình duyệt, không tự gọi RE_LOGIN.
- Đã đăng nhập thành công mới mở giao diện, **nhưng UI chat không đồng nghĩa chat realtime đã hoạt động**.
