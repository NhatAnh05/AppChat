# AppChat — Giai đoạn 3: API `RE_LOGIN` (WebSocket) + Docker

## 1. Phạm vi

Tài liệu dựa trên `chat_API.xlsx`, sheet `0Sheet1`, dòng 4 (`RE_LOGIN`). API #1 `REGISTER` và #2 `LOGIN` được giữ nguyên. Đây là **khung đã tích hợp vào luồng xác thực**, chưa xác nhận giao tiếp trực tiếp với Backend thật.

- Khi `LOGIN` thành công, lưu `{username, reLoginCode}` vào **sessionStorage** của tab (không lưu mật khẩu).
- Khi tải lại trang, nếu tab còn mã phiên, mở WebSocket mới và gửi `RE_LOGIN`.
- Khi WebSocket đã xác thực bị đóng ngoài ý muốn, thử khôi phục với mã phiên hiện tại.
- Khi nhận `RE_LOGIN: success`, **thay mã cũ bằng `RE_LOGIN_CODE` mới**, giữ socket đang mở.
- Nếu máy chủ trả lỗi hết hạn, quay về màn hình LOGIN và xóa mã đã lưu. Khi gặp lỗi mạng, thử tối đa 3 lần (chờ 1 giây, 2 giây giữa các lần).
- Nút **Đóng phiên trên thiết bị** xóa `sessionStorage` và đóng socket; **không gửi API #4 `LOGOUT`** (chưa triển khai).
- Chat, danh bạ và nhóm vẫn dùng dữ liệu mẫu phía Frontend, chưa gọi các API chat.

## 2. Hợp đồng API theo Excel

**URL:** `wss://chat.longapp.io.vn/chat/chat`

Request:

```json
{
  "action": "onchat",
  "data": {
    "event": "RE_LOGIN",
    "data": {
      "user": "long",
      "code": "nlu_2055829137"
    }
  }
}
```

Response thành công:

```json
{
  "status": "success",
  "event": "RE_LOGIN",
  "data": { "RE_LOGIN_CODE": "nlu_3928172635" }
}
```

Response hết hạn:

```json
{
  "status": "error",
  "event": "RE_LOGIN",
  "mes": "Re-Login error, session expired!"
}
```

Theo mô tả trong Excel, máy chủ giữ phiên trong **2 giờ**, nhưng thời gian thực tế và khả năng khôi phục phụ thuộc Backend. Frontend không được tự coi mã cũ còn hiệu lực, không đoán hoặc tự tạo `RE_LOGIN_CODE`.

## 3. Các file liên quan

| File | Chức năng |
|---|---|
| `src/services/reLoginProtocol.ts` | Xây dựng request JSON, đọc response RE_LOGIN |
| `src/services/reLoginService.ts` | Mở socket mới, gửi RE_LOGIN, retry tối đa 3 lần và nhận mã mới |
| `src/services/sessionStore.ts` | Lưu, đọc, xóa mã trong `sessionStorage` |
| `src/services/loginService.ts` | LOGIN lưu mã ban đầu; gắn socket dùng chung, đóng và xóa phiên khi chủ động kết thúc |
| `src/App.tsx` | Khôi phục khi reload/ngắt kết nối, màn hình chờ, xử lý hết hạn |
| `tests/reLoginProtocol.test.mjs` | Kiểm tra request/response theo tài liệu |
| `tests/sessionStore.test.mjs` | Kiểm tra lưu, thay và xóa mã phiên |

## 4. Chạy và kiểm tra trong WebStorm (Windows)

Trong thư mục chứa `package.json`:

```powershell
npm ci
npm run test:api
npm run build
```

Sau khi Docker Desktop hiển thị **Engine running**:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
```

Mở `http://localhost:8088/login` nếu Compose đang ánh xạ cổng 8088.

## 5. Các test case thủ công cần thực hiện với Backend thật

| Mã | Thao tác | Kết quả mong đợi |
|---|---|---|
| RL-01 | LOGIN tài khoản đúng, F5 khi đang chat | Gửi RE_LOGIN với mã đã nhận từ LOGIN, nhận success và quay lại chat |
| RL-02 | Mất kết nối ngắn, máy chủ còn cho khôi phục | Tự gọi RE_LOGIN, cập nhật mã mới, ở lại chat |
| RL-03 | Backend trả `session expired!` | Xóa mã, về màn hình LOGIN, hiển thị lý do |
| RL-04 | Backend trả success thiếu mã mới | Không chấp nhận phiên, về LOGIN |
| RL-05 | Đứt mạng lâu | Tối đa 3 lần thử, không lặp vô hạn, về LOGIN nếu đều thất bại |
| RL-06 | Avatar → Đóng phiên trên thiết bị, sau đó F5 | Không tự RE_LOGIN; vẫn ở màn hình LOGIN |
| RL-07 | Reload trên tab mới không cùng sessionStorage | Yêu cầu LOGIN, không tự mượn phiên từ tab khác |
| RL-08 | Docker build và truy cập localhost:8088 | Container Up, form LOGIN/REGISTER và chat hiển thị đúng |

**Lưu ý:** Để xem Frames trong Chrome: F12 → Network → WS → Messages. Che toàn bộ password và `RE_LOGIN_CODE` trong ảnh chụp báo cáo. Đừng dùng mã ví dụ trong Excel như mã hợp lệ thực tế.

## 6. Giới hạn và bảo mật

- `sessionStorage` có thể bị JavaScript cùng origin đọc, nên còn rủi ro XSS. Với sản phẩm triển khai rộng rãi, nên thỏa thuận thêm với bên cung cấp Backend về phiên bảo mật (ví dụ cookie HttpOnly qua BFF hoặc giải pháp lưu token an toàn tương đương).
- `sessionStorage` thường sống trong phạm vi **một tab** và còn khi tải lại tab; không phải bộ lưu trữ vĩnh viễn và không đồng nghĩa phiên server kéo dài vô hạn.
- Cơ chế khôi phục bắt đầu khi browser nhận sự kiện WebSocket `close`; hệ điều hành mất mạng có thể không tạo sự kiện này ngay. Heartbeat/ping cần thỏa thuận giao thức với Backend, không tự phát sinh gói tin không được mô tả trong Excel.
- Không gửi `RE_LOGIN` trong lúc một socket đã xác thực còn hoạt động bình thường.
- API #4 `LOGOUT`, các API chat và kiểm thử end-to-end trên máy chủ thật vẫn là hạng mục tiếp theo.
