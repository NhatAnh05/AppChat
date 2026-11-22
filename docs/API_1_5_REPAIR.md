# AppChat – Sửa API 1–4 và tích hợp API 5 (16/11/2026)

## Phạm vi

Bản này được tách từ `AppChat_API1_6_Repair_2026_11_16.zip` theo yêu cầu **chỉ triển khai API số 1 đến số 5**. Không chứa `CREATE_ROOM` (API 6). Các mục hiển thị nhóm hiện có là dữ liệu mà API 5 trả về, không phải API 6.

| # | API | Tích hợp | Mục đích |
|---|---|---|---|
| 1 | `REGISTER` | `authService.registerAccount`, `Register.tsx` | Đăng ký bằng socket chưa xác thực; xử lý success/error/timeout |
| 2 | `LOGIN` | `loginService.loginAccount`, `Login.tsx` | Gửi username/password, nhận `RE_LOGIN_CODE` thật từ Backend |
| 3 | `RE_LOGIN` | `loginService.restoreLoginSession`, `AuthInitializer.tsx` | Khôi phục sau F5/mất kết nối; xoay mã phiên sau success |
| 4 | `LOGOUT` | `logoutService.logoutCurrentSession`, `App.tsx` | Chờ ACK trên socket đang đăng nhập; xóa phiên sau khi kết thúc |
| 5 | `GET_USER_LIST` | `contactService.getUserList`, `ContactDirectory.tsx` | Lấy người dùng/nhóm từ Backend sau xác thực; hỗ trợ làm mới |

## Kiến trúc phiên

- `loginService.ts` quản lý socket đã xác thực và thông tin phiên.
- `websocket.ts` dùng lại socket ấy cho danh bạ và chức năng chat có sẵn, không tự tạo socket thứ hai cho API 5.
- Redux giữ trạng thái giao diện; `sessionStore.ts` lưu `RE_LOGIN_CODE` trong `sessionStorage`, không lưu mật khẩu.
- `LOGOUT` ngăn khôi phục phiên mới, chờ ACK nếu có thể, sau đó đóng kết nối và xóa session cục bộ.

## Request WebSocket

```json
{"action":"onchat","data":{"event":"REGISTER","data":{"user":"new_account","pass":"password"}}}
```
```json
{"action":"onchat","data":{"event":"LOGIN","data":{"user":"new_account","pass":"password"}}}
```
```json
{"action":"onchat","data":{"event":"RE_LOGIN","data":{"user":"new_account","code":"RE_LOGIN_CODE_from_server"}}}
```
```json
{"action":"onchat","data":{"event":"LOGOUT"}}
```
```json
{"action":"onchat","data":{"event":"GET_USER_LIST","data":{}}}
```

## Kiểm thử

```powershell
npm ci
npm run test:api
npm test
npm run build
```

`tests/api1to5Integration.test.mjs` kiểm tra mô phỏng các API 1–5. Các bài test chạy bằng **WebSocket giả lập**, không phải bằng chứng đã giao tiếp thành công với Backend giảng viên.

Để nghiệm thu thực tế:

1. Đăng ký username mới và kiểm tra response REGISTER.
2. Đăng nhập đúng/sai mật khẩu và kiểm tra LOGIN.
3. Nhấn F5, xác nhận RE_LOGIN trả mã mới; thử mã hết hạn.
4. Đăng xuất, xác nhận LOGOUT ACK và F5 không tự khôi phục.
5. Vào Danh bạ → Làm mới (API 5), xác minh GET_USER_LIST trên tab WS của DevTools.

File `server/uploads` chứa dữ liệu riêng của người dùng không được đóng gói. Không đưa mật khẩu hay mã phiên vào log/GitHub.
