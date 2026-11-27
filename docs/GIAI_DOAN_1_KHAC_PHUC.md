# Giai đoạn 1 – Ổn định hệ thống AppChat

## Mục tiêu và phạm vi

- Source đầu vào: `AppChat(1).zip` người dùng cung cấp.
- Đối chiếu theo `API_Chat_WebSocket_Tu_Anh.xlsx` (sheet `API WebSocket`).
- Không thay đổi giao diện hoặc mô hình máy chủ, không thay backend của giảng viên.
- Sửa lỗi unit/integration test, thống nhất API lịch sử, đồng bộ gửi `SEND_CHAT` cá nhân/nhóm và hạn chế lộ mã phiên.

## Các điểm đã sửa

| Hạng mục | Trước | Sau |
|---|---|---|
| Lấy lịch sử cá nhân | `GET_PEOPLE_CHAT_MES` | `CHAT_PEOPLE_GET_MES` |
| Lấy lịch sử phòng | `GET_ROOM_CHAT_MES` | `CHAT_PEOPLE_GET_MES` |
| Lỗi lịch sử phòng | Chỉ nhận event cũ | Vẫn nhận `GET_ROOM_CHAT_MES` **khi status=error** như tài liệu |
| Ghép phản hồi lịch sử | Hai queue riêng | Một queue chung, phân biệt phản hồi theo cấu trúc và tên nhóm |
| Gửi chat cá nhân/nhóm | Hai queue riêng | Queue chung cho `SEND_CHAT`, giảm ghép nhầm ACK |
| ACK chat cá nhân | Có thể nhận success không có payload | Chỉ xác nhận khi `to`, `mes` khớp (và người gửi nếu có); không tự coi success trống là đã gửi |
| Test realtime | Lỗi import module không có `.ts` | Import TypeScript hợp lệ trong Node 22 với `--experimental-strip-types` |
| Mã `RE_LOGIN_CODE` | Vào Redux action/state và localStorage | Chỉ do `loginService/sessionStore` lưu trong sessionStorage của tab |
| TypeScript | Lỗi kiểu `online` tùy chọn trong `App.tsx` | Bổ sung type `ContactEntry[]` để giữ giá trị optional |
| README | Còn dấu xung đột Git | Viết lại hướng dẫn cài đặt/chạy/test |

### Giải thích quan trọng

Theo tài liệu, cả chat cá nhân và chat nhóm gọi `CHAT_PEOPLE_GET_MES` với `{name,page}`. Phản hồi thành công cá nhân có `data` dạng mảng; phòng có `data` dạng đối tượng gồm `name`, `user`, `chatMess`. Vì backend không trả request ID, client chỉ thực hiện **một yêu cầu lịch sử tại một thời điểm**. Với nhóm, client kiểm tra thêm tên phòng. Tài liệu ghi `GET_ROOM_CHAT_MES` cho **lỗi** phòng nên vẫn hỗ trợ nhận lỗi đó, nhưng **không gửi** request bằng event cũ.

Cả tin nhắn cá nhân và nhóm đều dùng `SEND_CHAT`. Client dùng một hàng đợi chung để tránh đồng thời có hai yêu cầu không phân biệt được ACK. Một success thiếu `to`/`mes` sẽ không xác nhận gửi thành công; luồng cá nhân sẽ thử đối chiếu lịch sử trước khi quyết định kết quả. Khi mất mạng hoặc timeout, người dùng **không nên nhấn gửi lại liên tục** vì server có thể đã lưu tin nhắn dù ACK bị mất.

Phiên đăng nhập vẫn tự khôi phục sau F5 trong cùng tab khi token còn hiệu lực. Không còn chứa token trong Redux, localStorage. Đây là cải thiện quản lý phiên phía client, **không** thay thế xác thực và phân quyền backend.

## Kết quả kiểm thử

- Trước khi sửa: **174/177 PASS**, 3 lỗi.
- Sau khi sửa và bổ sung test: **181/181 PASS**, bao gồm test mô phỏng chiều A→B, B→A, ACK trống, ACK nhóm không liên quan và hàng đợi gửi.
- Kiểm tra TypeScript `tsc -b`: **PASS** với các dependencies lấy từ ZIP.
- `npm run lint` trong source hiện còn **10 lỗi, 3 cảnh báo có sẵn**, chủ yếu quy tắc React Hooks, thay đổi state trong effect và một số quy tắc lint ở các file ngoài luồng API/phiên; chưa sửa ngoài phạm vi Giai đoạn 1.
- `vite build` trên môi trường kiểm tra Linux: **chưa xác nhận**, vì ZIP có binding Rolldown dành cho Windows nhưng thiếu binary Linux, và npm network install không hoàn tất. Chạy `npm ci && npm run build` trên máy Windows/WebStorm.
- Các test trên chỉ mô phỏng WebSocket và kiểm tra logic client. **Chưa test trực tiếp trên server giảng viên bằng tài khoản thật**, nên không khẳng định hai phía đã nhận tin thành công ngoài thực tế.

## Hướng dẫn chạy và kiểm thử thủ công

```powershell
npm ci
npm test
npm run build
npm run dev:full
```

Truy cập đường dẫn Vite hiển thị (mặc định `http://localhost:5173`). Dùng **2 tài khoản A và B** khác nhau, hai cửa sổ trình duyệt tách biệt:

1. A gửi `Xin chào`, B nhận ngay và có đúng tên người gửi.
2. B gửi `Đã nhận ❤️`, A nhận và hiển thị đủ chữ + emoji.
3. F5 cả hai trình duyệt: lịch sử phải tải lại, không nhân đôi tin.
4. A và B tham gia cùng nhóm, gửi tin hai chiều; A chuyển qua chat cá nhân khi B đang gửi nhóm và kiểm tra không nhầm ACK.
5. Đóng kết nối/tắt mạng 5–10 giây, kết nối lại và kiểm tra việc đồng bộ lịch sử.
6. Logout rồi F5: không khôi phục phiên đã thoát.
7. Mở DevTools > Application > Local Storage: không có `reLoginCode` hoặc `userId` từ authSlice; kiểm tra Session Storage có `appchat:auth:relogin:v1` khi đang đăng nhập (không sao chép mã này).
8. Thử gửi lại đúng một lần chỉ khi biết chắc server chưa lưu; không nhấn gửi liên tục khi ACK bị mất.

Có sẵn `npm run test:realtime:live` để kiểm tra trực tiếp A→B và B→A. Lệnh cần bốn biến môi trường `CHAT_TEST_USER_A`, `CHAT_TEST_PASS_A`, `CHAT_TEST_USER_B`, `CHAT_TEST_PASS_B`, dùng tài khoản thử nghiệm được phép và sẽ gửi hai tin thật. Xem `README.md`.

## Những hạn chế chưa giải quyết bằng frontend

- Backend không cung cấp client request ID, server receipt/đã xem; phản hồi rất muộn vẫn có thể khó ghép tuyệt đối.
- Nếu server thực không hỗ trợ event như tài liệu hoặc không broadcast đúng, frontend không thể tự bảo đảm realtime. Hãy dùng Nhật ký API và script kiểm tra server để phân biệt lỗi.
- Dữ liệu nháp, ghim, hồ sơ và một số trạng thái vẫn lưu cục bộ trong trình duyệt, không tự đồng bộ giữa máy nếu thiếu API.
- Không thay đổi media server và tính năng gọi thoại/video trong giai đoạn này.
