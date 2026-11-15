# API SỐ 4 — LOGOUT

**Đặc tả giao thức WebSocket & kế hoạch triển khai Frontend**

Dự án: AppChat (React + TypeScript + WebSocket + Docker) | Phiên bản tài liệu: 1.0

> **Lưu ý:** Đây là tài liệu đặc tả/triển khai, KHÔNG phải bằng chứng API LOGOUT đã hoàn thành hoặc đã kiểm thử trên máy chủ thật.

## 1. Mục tiêu và phạm vi

API LOGOUT cho phép người dùng kết thúc phiên đã xác thực. Theo tài liệu máy chủ, thao tác sẽ giải phóng session và cache liên quan trên Backend. Frontend cần gửi yêu cầu từ chính WebSocket đang đăng nhập, ghi nhận phản hồi, dừng cơ chế RE_LOGIN và trở về màn hình LOGIN.

| **Hạng mục**     | **Thông tin**                                       |
|------------------|-----------------------------------------------------|
| Mã API / event   | 04 / LOGOUT                                         |
| Transport        | WebSocket (WSS)                                     |
| Endpoint         | wss://chat.longapp.io.vn/chat/chat                  |
| Yêu cầu xác thực | Dùng kết nối WebSocket đã LOGIN/RE_LOGIN thành công |
| Phụ thuộc        | API 02 LOGIN và API 03 RE_LOGIN                     |
| Giao diện đích   | /login, không giữ phiên xác thực đang hoạt động     |

## 2. Hợp đồng API từ chat_API.xlsx

Nguồn: chat_API.xlsx → sheet “0Sheet1” → hàng “LOGOUT” (dòng 5). Hai sheet trong tệp đều nêu cùng cấu trúc bên dưới.

### 2.1. Request — chính xác theo tài liệu

```json
{
  "action": "onchat",
  "data": {
    "event": "LOGOUT"
  }
}
```

Không truyền username, password, RE_LOGIN_CODE hoặc đối tượng data rỗng nếu không cần thiết. Máy chủ gắn hành động với phiên WebSocket đang được xác thực.

### 2.2. Response thành công — chính xác theo tài liệu

```json
{
  "status": "success",
  "event": "LOGOUT",
  "data": "You are Logout!"
}
```

> **Lưu ý:** Excel không cung cấp response lỗi cụ thể cho LOGOUT. Không tự coi một chuỗi thông báo lỗi do Frontend đặt ra là hợp đồng Backend.

## 3. Hiện trạng source AppChat sau API số 3

Đối chiếu source “AppChat_API3_RE_LOGIN_HoanThien_09_11_2026.zip”:

| **File**                     | **Hiện trạng liên quan**                                                                                                  |
|------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| src/App.tsx                  | Hàm logout() gọi sendChatEvent("LOGOUT"), sau đó ngay lập tức gọi disconnectLoginSession() và onExit().                   |
| src/services/chatSocket.ts   | sendChatEvent gửi sự kiện qua WebSocket đã xác thực; module có listener chung nhận thông điệp của server.                 |
| src/services/loginService.ts | disconnectLoginSession() xóa sessionStorage, đóng WebSocket và đánh dấu signed-out; comment vẫn coi API 04 ngoài phạm vi. |
| src/services/sessionStore.ts | Quản lý username và RE_LOGIN_CODE theo tab; có clearLoginSession().                                                       |

### 3.1. Thiếu sót cần xử lý
- Chưa chờ response LOGOUT: Frontend đóng socket ngay sau khi gửi, nên không chứng minh được máy chủ đã xử lý thành công.
- Chưa có hàm logout chuyên trách trả về kết quả và hỗ trợ timeout, chống bấm lặp, chống đua với RE_LOGIN.
- Chưa có unit test/integration test cho việc gửi LOGOUT và vô hiệu hóa phiên sau đăng xuất.
- Cần phân biệt “đã đóng phiên cục bộ” và “Backend đã xác nhận LOGOUT”.

## 4. Luồng nghiệp vụ đề xuất

| **Bước** | **Trách nhiệm Frontend**                                       | **Điều kiện / kết quả**                               |
|----------|----------------------------------------------------------------|-------------------------------------------------------|
| 1        | Người dùng chọn Đăng xuất                                      | Chỉ bắt đầu một quy trình logout.                     |
| 2        | Khóa các thao tác gửi tin; đặt trạng thái signing-out          | Dừng tự động khôi phục phiên.                         |
| 3        | Lấy WebSocket hiện đang authenticated và OPEN                  | Nếu không có socket: thực hiện thoát cục bộ.          |
| 4        | Gắn listener chờ riêng event LOGOUT; gửi JSON đúng hợp đồng    | Không đóng socket ngay sau lệnh send().               |
| 5        | Đợi status=success/event=LOGOUT, hoặc lỗi/timeout/ngắt kết nối | Chỉ response success mới chứng minh Backend xác nhận. |
| 6        | Cuối cùng hủy listeners/timers; xóa mã phiên; đóng socket      | Dù mất mạng vẫn không quay lại chat tự động.          |
| 7        | Xóa state người dùng đang đăng nhập; chuyển về /login          | Thông báo khác nhau theo xác nhận hay thoát cục bộ.   |

### 4.1. Phân biệt kết quả

Backend xác nhận: có gói {event: LOGOUT, status: success}. Giao diện có thể thông báo “Đã đăng xuất”.

Không có xác nhận: socket lỗi/đóng/timeout. Frontend vẫn xóa phiên cục bộ và về LOGIN; có thể thông báo “Đã thoát trên thiết bị; chưa xác nhận trạng thái phiên trên máy chủ”.

## 5. Thiết kế module và trách nhiệm

| **Tệp dự kiến**                        | **Vai trò**                                                                                               |
|----------------------------------------|-----------------------------------------------------------------------------------------------------------|
| src/services/logoutProtocol.ts \[MỚI\] | makeLogoutRequest() tạo đúng envelope; readLogoutResponse() chỉ chấp nhận event LOGOUT và status success. |
| src/services/logoutService.ts \[MỚI\]  | Điều phối gửi/đợi ACK, timeout, abort, chống lặp; cleanup ở finally.                                      |
| src/services/loginService.ts \[SỬA\]   | Cung cấp socket hiện tại; chặn reconnect khi signing-out; giải phóng session và socket an toàn.           |
| src/App.tsx \[SỬA\]                    | Chuyển nút Đăng xuất sang async; hiển thị đang xử lý và phản hồi rõ ràng.                                 |
| tests/logoutProtocol.test.mjs \[MỚI\]  | Kiểm tra request/response chính xác theo Excel và bỏ qua gói sai event.                                   |
| tests/logoutService.test.mjs \[MỚI\]   | WebSocket mock: ACK, timeout, onclose, double-click, abort, race reconnect.                               |
| docs/API_LOGOUT_DOCKER.md \[TÙY CHỌN\] | Bản hướng dẫn Markdown nếu dự án muốn đồng bộ với tài liệu API 01–03.                                     |

### 5.1. Nguyên tắc tích hợp
- LOGOUT dùng chung WebSocket đã xác thực. KHÔNG mở WebSocket mới chỉ để LOGOUT nếu chưa có phiên hợp lệ.
- Trình xử lý phản hồi phải lọc theo event === "LOGOUT"; bỏ qua gói tin của SEND_CHAT, GET_USER_LIST, v.v.
- Chỉ gọi disconnectLoginSession() sau khi ACK được xử lý hoặc quy trình kết thúc bằng lỗi/timeout; luôn cleanup listener và timer.
- Khi bắt đầu LOGOUT, đặt cờ manualLogout/signing-out trước để onclose không kích hoạt RE_LOGIN.
- Không lưu mật khẩu hoặc RE_LOGIN_CODE vào log; không gửi mã phiên trong request LOGOUT.

### 5.2. Logic điều phối tham khảo (pseudocode)

```typescript
async function logoutCurrentSession() {
  if (logoutInProgress) return existingLogoutPromise;
  markSigningOut(); // khóa reconnect/re-login
  try {
    const socket = getAuthenticatedSocket();
    if (socket?.readyState === WebSocket.OPEN) {
      // gắn listener trước khi send; chờ ACK hoặc timeout
      return await sendLogoutAndWaitForAck(socket);
    }
    return { backendConfirmed: false };
  } finally {
    // kết thúc phiên cục bộ kể cả khi mạng lỗi
    disconnectLoginSession();
    clearUiAuthState();
  }
}
```

Đoạn trên mô tả trách nhiệm và thứ tự xử lý, không phải mã đã được bổ sung vào repository.

## 6. Xử lý lỗi và bảo mật
- Timeout ACK (ví dụ 5 giây) là ngưỡng do Frontend lựa chọn; Excel không quy định thời gian này.
- Máy chủ trả status=error: hiển thị thông báo dựa trên mes nếu có, nhưng vẫn xóa phiên cục bộ. Nội dung/format lỗi cần kiểm chứng thực tế.
- Socket đã đóng: bỏ qua gửi, xóa sessionStorage và UI xác thực; không cố mở kết nối mới để logout.
- Sau logout, F5 không được kích hoạt RE_LOGIN bằng mã cũ. Nếu Backend đã xác nhận, mã phiên cũ không nên còn hiệu lực.
- Dữ liệu chat cache phía trình duyệt: cần xác định chính sách riêng (giữ lịch sử theo tài khoản hay xóa trên thiết bị). Không đồng nhất cache cục bộ với cache Backend.

## 7. Bộ test case cho API số 4

| **ID** | **Kịch bản**                          | **Kết quả mong đợi**                                         |
|--------|---------------------------------------|--------------------------------------------------------------|
| LG-01  | Đang đăng nhập, bấm Đăng xuất         | Gửi đúng request LOGOUT trên socket hiện tại.                |
| LG-02  | Server trả success LOGOUT             | Ghi nhận ACK; dọn session/socket; điều hướng /login.         |
| LG-03  | Server gửi event khác trước ACK       | Không nhầm gói khác thành kết quả LOGOUT.                    |
| LG-04  | Server trả status=error (giả lập)     | Không đánh dấu Backend success; vẫn thoát cục bộ.            |
| LG-05  | Mạng lỗi hoặc socket đóng trước ACK   | Không treo UI; xóa phiên cục bộ.                             |
| LG-06  | Server không phản hồi tới timeout     | Không treo vô hạn; cleanup listener/timer/socket.            |
| LG-07  | Nhấn Đăng xuất liên tục hai lần       | Chỉ có một phiên xử lý; không gửi lặp.                       |
| LG-08  | Đang RE_LOGIN mà người dùng đăng xuất | Hủy/khóa reconnect; không được quay về chat.                 |
| LG-09  | Đã logout, nhấn F5                    | Không khôi phục từ mã phiên cũ.                              |
| LG-10  | Request thiếu hoặc dư data            | Serializer tạo đúng JSON tài liệu; không thêm mã nhạy cảm.   |
| LG-11  | Logout khi WebSocket chưa kết nối     | Thoát cục bộ; không tạo kết nối mới.                         |
| LG-12  | Đăng nhập lại sau logout              | LOGIN mới có thể hoạt động bình thường, phiên mới tách biệt. |

### 7.1. Hướng dẫn kiểm thử thủ công

Môi trường: ứng dụng chạy local (Vite/Docker), Backend tại wss://chat.longapp.io.vn/chat/chat, tài khoản thử nghiệm có thể LOGIN thành công.
- Mở DevTools → Network → WS trước khi đăng nhập để lưu lại toàn bộ khung tin cần kiểm tra.
- Đăng nhập và xác nhận đã nhận LOGIN: success cùng mã phiên (không chia sẻ giá trị mã).
- Từ giao diện chat, chọn Đăng xuất; trong WS Frames kiểm tra request LOGOUT và response tương ứng.
- Xác nhận UI về /login, không tự đăng nhập lại khi F5; thử đăng nhập mới bằng tài khoản hợp lệ.
- Ngắt mạng trước khi logout để xác nhận ứng dụng vẫn thoát cục bộ và không treo.

### 7.2. Tiêu chí nghiệm thu

| **Điều kiện**       | **Bằng chứng tối thiểu**                                                   |
|---------------------|----------------------------------------------------------------------------|
| Giao thức đúng      | Request đúng Excel; unit test serializer/parser PASS.                      |
| Backend nhận logout | Có response LOGOUT: success trên WebSocket thực.                           |
| Phiên được kết thúc | F5 không tự RE_LOGIN; socket cũ không còn hoạt động.                       |
| Xử lý bất thường    | Timeout/lỗi mạng/double-click không giữ người dùng trong trạng thái mơ hồ. |
| Không hồi quy       | REGISTER/LOGIN/RE_LOGIN và các test hiện có tiếp tục PASS.                 |

## 8. Hướng dẫn thực hiện trong dự án

Các lệnh dưới đây áp dụng khi đã triển khai code API số 4 vào repository. Tài liệu Markdown này chưa kèm mã nguồn.

### 8.1. Kiểm tra trước khi chạy

```powershell
cd C:\Users\ASUS\Downloads\AppChat-GitHub
npm ci
npm run test:api
npm run build
```

### 8.2. Kiểm tra với Docker

```powershell
docker compose up -d --build
docker compose ps
```

Sau khi ứng dụng chạy, mở đường dẫn cổng do docker-compose.yml cấu hình (trước đó là http://localhost:8088/login). Theo dõi WebSocket Frames để xác nhận ACK thay vì chỉ quan sát giao diện.

### 8.3. Git an toàn, không xóa lịch sử commit

```powershell
git status
git diff --check
git add src/App.tsx src/services tests docs
git diff --cached --check
git commit -m "Implement API 4 LOGOUT with WebSocket acknowledgement"
git push origin main
```

> **Lưu ý:** Chỉ commit các file API 04 thực sự được tạo/sửa; tránh đưa .env, node_modules, dist, tsconfig.tsbuildinfo hoặc dữ liệu đăng nhập vào Git. Thay đổi đường dẫn git add theo đúng file thực tế.

## 9. Phạm vi ngoài API số 4
- Không sửa giao thức Backend, không tạo thêm endpoint HTTP REST cho LOGOUT.
- Không tự suy đoán schema lỗi LOGOUT khi Excel chỉ cung cấp response thành công.
- Không triển khai GET_USER_LIST, CREATE_ROOM, SEND_CHAT hay các API chat khác trong phạm vi tài liệu này.
- Không bảo đảm server đã vô hiệu hóa code chỉ từ thao tác xóa sessionStorage; phải có xác nhận Backend.

## 10. Tham chiếu và nguồn

| **Nguồn**                                 | **Phạm vi sử dụng**                                                                                                      |
|-------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| chat_API.xlsx / 0Sheet1 / LOGOUT (dòng 5) | Endpoint, request, response success, ý nghĩa kết thúc session/cache Backend.                                             |
| AppChat API3 source / src/App.tsx         | Hiện trạng hàm logout gửi sự kiện rồi đóng phiên ngay.                                                                   |
| AppChat API3 source / loginService.ts     | Cơ chế disconnect, sessionStore và RE_LOGIN cần phối hợp.                                                                |
| AppChat API3 source / chatSocket.ts       | Socket đã xác thực, bộ phát sự kiện và listener phản hồi chung.                                                          |
| Phần thiết kế bổ sung của tài liệu này    | Timeout, điều phối bất đồng bộ, test case và cách nghiệm thu: đề xuất triển khai Frontend, không phải quy định từ Excel. |

Trạng thái bàn giao: ĐÃ VIẾT TÀI LIỆU ĐẶC TẢ · CHƯA THỰC HIỆN/NGHIỆM THU API 04 TRÊN BACKEND.
