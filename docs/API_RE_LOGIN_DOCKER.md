# AppChat — API số 3: RE_LOGIN (hoàn thiện tích hợp Frontend)

**Nguồn chuẩn:** `chat_API.xlsx` → sheet `0Sheet1` → dòng `RE_LOGIN` (số 4).
**Phạm vi:** khôi phục phiên WebSocket sau khi tải lại trang hoặc mất kết nối. Không thay đổi giao thức Backend.
**Trạng thái:** đã triển khai trong React + có unit/integration tests giả lập WebSocket; **chưa xác nhận E2E trên máy chủ thật của giảng viên**.

## 1. Hợp đồng từ file Excel

WebSocket: `wss://chat.longapp.io.vn/chat/chat`

Request:

```json
{"action":"onchat","data":{"event":"RE_LOGIN","data":{"user":"long","code":"nlu_2055829137"}}}
```

Response thành công:

```json
{"status":"success","event":"RE_LOGIN","data":{"RE_LOGIN_CODE":"nlu_3928172635"}}
```

Response hết hạn:

```json
{"status":"error","event":"RE_LOGIN","mes":"Re-Login error, session expired!"}
```

Theo tài liệu, máy chủ có phiên khôi phục trong khoảng **2 giờ**. Chỉ máy chủ quyết định mã còn hiệu lực; không tự sinh `RE_LOGIN_CODE` ở Frontend.

## 2. Đã triển khai trong source này

| Vị trí | Nhiệm vụ |
|---|---|
| `src/services/reLoginProtocol.ts` | Tạo đúng JSON RE_LOGIN, phân tích `success/error`, không chấp nhận dữ liệu khác event |
| `src/services/reLoginService.ts` | Mở socket mới, chờ RE_LOGIN, timeout/hủy yêu cầu, đóng socket lỗi và giữ socket nếu thành công |
| `src/services/sessionStore.ts` | Lưu username + mã phiên trong `sessionStorage` của tab, thay mã sau mỗi thành công, tự bỏ bản ghi cũ hơn 2 giờ |
| `src/services/loginService.ts` | Sau LOGIN lưu code; khi F5 hay bị close thì gọi RE_LOGIN, tối đa 3 lần cho lỗi mạng; không thử lại khi server từ chối mã; tránh hai socket song song |
| `src/App.tsx` | Hiển thị trạng thái đang xác minh phiên, không mở chat trước khi server xác nhận, về `/login` nếu hết hạn |
| `tests/reLoginProtocol.test.mjs` | Kiểm thử JSON và response theo Excel |
| `tests/reLoginService.test.mjs` | Kiểm thử WebSocket giả lập, từ chối mã và hủy yêu cầu |
| `tests/sessionStore.test.mjs` | Kiểm thử lưu mã, thay mã, hết hạn, xóa phiên |
| `tests/reLoginIntegration.test.mjs` | Kiểm thử tích hợp LOGIN → lưu mã, RE_LOGIN sau F5, tự hồi phục socket, expired và đóng phiên |

**Luồng xử lý:**

1. `LOGIN` trả `RE_LOGIN_CODE` → lưu vào `sessionStorage` (không lưu password).
2. Tải lại trang (`F5`) → trạng thái **Đang kiểm tra và khôi phục phiên** → đọc mã còn hạn trong tab → mở socket mới → gửi `RE_LOGIN`.
3. `RE_LOGIN: success` + `RE_LOGIN_CODE` mới → cập nhật storage, gắn lại socket chung, thông báo các hook chat tái đăng ký và tải lại danh sách hội thoại.
4. Mất WebSocket → thử khôi phục tương tự. Nếu mất mạng, thử tối đa **3 lần tổng cộng** (đợi khoảng 1 giây rồi 2 giây giữa các lần thử).
5. `RE_LOGIN: error`, hoặc `success` thiếu mã mới → xóa mã và quay về màn hình `LOGIN` ngay (không retry sai mã).
6. Người dùng đóng phiên → dừng các lần thử đang chờ, xóa mã và đóng socket; F5 không được tự khôi phục.

**Ghi chú API #4:** Source tải lên đã có nút đăng xuất gửi sự kiện `LOGOUT`; API số 3 không thêm xác nhận ACK `LOGOUT` hoặc kiểm thử API #4. Không đánh đồng việc đóng kết nối trên trình duyệt với việc máy chủ đã xác nhận đăng xuất.

## 3. Kiểm tra trên WebStorm (Windows)

Tại thư mục AppChat chứa `package.json`:

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

Truy cập `http://localhost:8088/login` (cổng mặc định theo `docker-compose.yml`). Khi sửa code React, phải build lại image bằng `docker compose up -d --build`.

## 4. Kịch bản E2E với máy chủ thật (chưa xác nhận)

| ID | Thao tác | Kết quả đúng |
|---|---|---|
| RL-01 | Đăng nhập bằng username/password thật, F5 | Sau khi nhận `RE_LOGIN: success`, trở lại chat, **không** nhập password lần nữa |
| RL-02 | F5 lần hai sau lần khôi phục thành công | Request dùng **mã mới**, không lặp mã cũ |
| RL-03 | Ngắt mạng/đóng WebSocket bất ngờ rồi nối lại | Tự gọi RE_LOGIN, socket chat mới hoạt động |
| RL-04 | Server trả `session expired!` | Xóa mã lưu, chuyển `/login` |
| RL-05 | Máy chủ trả success thiếu code | Không cho vào chat, về `/login` |
| RL-06 | Mạng không khả dụng | Tối đa 3 lần kết nối, sau đó yêu cầu đăng nhập lại |
| RL-07 | Avatar → Đăng xuất → F5 | Không tự khôi phục phiên đã đóng |
| RL-08 | Docker build và chạy container | `appchat-frontend` ở trạng thái Up, dùng được trang đăng nhập |

**Cách kiểm tra:** Chrome `F12` → Network → WS → Messages. Chỉ kiểm tra tên sự kiện và trạng thái. **Không chụp hoặc chia sẻ mật khẩu và mã `RE_LOGIN_CODE`**, vì mã này cho phép khôi phục phiên.

## 5. Hạn chế và bảo mật

- `sessionStorage` là phương án triển khai Frontend cho môn học: script cùng origin có thể đọc mã (rủi ro XSS). Hệ thống production nên thiết kế phiên bảo mật hơn với bên cung cấp Backend.
- `sessionStorage` áp dụng theo tab/phiên trang; hành vi nhân bản tab khác nhau theo trình duyệt. Không coi đó là cơ chế phiên đa thiết bị.
- `sessionStorage` 2 giờ là biện pháp client để loại mã cũ; **Backend vẫn quyết định** mã hợp lệ hay không.
- Trong mạng chập chờn, WebSocket có thể chưa phát `close` ngay. Không tự gửi heartbeat ngoài đặc tả API.
- Sau 3 lần thử không kết nối được, ứng dụng yêu cầu đăng nhập lại. Cơ chế này có thể được điều chỉnh nếu nhóm muốn giữ UI offline lâu hơn.
- Tests giả lập không chứng minh máy chủ production hỗ trợ hoặc có thể khôi phục thành công tại thời điểm kiểm thử.
