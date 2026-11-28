# LyraChat – Bản vá P1

## Phạm vi và cách áp dụng

Bản vá dựa trên AppChat (2).zip, bản vá P0 trước push, TS6133 và ESLint đã được áp dụng. Chỉ ghi đè các tệp trong ZIP tại thư mục gốc dự án. Không thay package.json, package-lock.json, .gitignore, .dockerignore, cấu hình P0 đã cập nhật hoặc dữ liệu upload. Không cần npm ci nếu dependencies đã đầy đủ.

Chạy trên PowerShell:

```powershell
npm test
npm run build
npm run lint
npm audit
npm run dev:full
```

Bộ kiểm thử P1 riêng:

```powershell
node --experimental-strip-types --test tests/p1Regression.test.mjs tests/p1DevFull.test.mjs
```

## Các mục P1

| Mã | Thay đổi |
|---|---|
| P1.01 | ID tạm có namespace live:/ack:/local:. Hợp nhất theo ID server; đối chiếu một-một các bản ghi mới theo hội thoại, loại, người gửi, người nhận, nội dung, thời gian (2 giây). Không xóa các lần gửi không rõ quan hệ. |
| P1.02 | Không thay toàn bộ hội thoại khi tải trang 1. Giữ lại dữ liệu trang cũ và cập nhật hasMore theo trang sâu nhất. |
| P1.03 | Cấu hình profile API; mặc định giữ thứ tự đang được dùng, hỗ trợ request ghi trong Excel. Fallback chỉ khi ACTION_NOT_EXIT. |
| P1.04 | Kiểm tra hai đầu hội thoại cá nhân trước khi nhận response. Cô lập socket có request lịch sử timeout/hủy để phản hồi đến muộn không phục vụ request kế tiếp. |
| P1.05 | Timeout/mất kết nối sau khi gửi nhóm: UnconfirmedSendError; giữ tin trạng thái chưa xác nhận, làm mới lịch sử, không tự gửi lại. |
| P1.06 | Giữ kiểm tra người gửi và bổ sung chống ACK trùng ID theo phòng/socket/ID đã biết. |
| P1.07 | Bộ đệm realtime nhóm giới hạn 200 tin, TTL 30 giây. Chỉ phát tin khi membership được xác nhận, loại phòng không có quyền. |
| P1.08 | Profile event online; kiểm tra username nếu response có trường này; cô lập socket khi timeout. |
| P1.09 | Đã sửa từ bản vá trước, không ghi đè UserSearchDialog.tsx. |
| P1.10 | Sau reconnect, làm mới danh bạ rồi lên kế hoạch đồng bộ hội thoại đang mở, hội thoại cache và hội thoại có actionTime thay đổi; tuần tự, có giới hạn tối đa 10 trang mỗi hội thoại/lần; dừng khi lỗi request. |
| P1.11 | Trạng thái pending, confirmed, failed, unconfirmed trên giao diện; không tuyên bố người nhận đã nhận/đọc. Không tự resend. |
| P1.12 | OUT_ROOM thành công hủy lịch sử đang chờ; reducer chặn cập nhật nhóm không còn membership, xóa cache, giữ requestId guard khi rời/tham gia lại. Danh sách đến muộn không ghi đè thay đổi nhóm cục bộ trong request. |
| P1.13–16 | Khởi động Vite sau khi media bind thành công qua IPC; báo lỗi bind rõ ràng; quản lý tiến trình con và xử lý Ctrl+C/SIGTERM/child failure; chạy Node trực tiếp, shell:false. |

Sửa thêm liên quan: nút làm mới lịch sử nhóm gọi trực tiếp API (P2.16); giữ nội dung nháp gốc khi gửi thất bại; vô hiệu hóa reply/reaction khi chỉ có ID tạm; chống ACK trùng cho chuyển tiếp/reaction. Không triển khai các tính năng P2 khác.

## API Excel và deployment

Excel hàng 11/12: request `CHAT_PEOPLE_GET_MES` cho cả nhóm và cá nhân. Hàng 11 response lỗi dùng `GET_ROOM_CHAT_MES`. Hàng 15 request `CHAT_CHECK_USER_ONLINE`, response `CHECK_USER_ONLINE`.

Profile mặc định giữ `GET_PEOPLE_CHAT_MES`, `GET_ROOM_CHAT_MES`, `CHECK_USER_ONLINE` vì mã nguồn và test mock trước đó đã dùng chúng. Không khẳng định đã kết nối production trong lần vá này. Nếu cần ưu tiên Excel, thêm dòng sau vào `.env.local` (không commit file này), sau đó khởi động lại Vite:

```dotenv
VITE_CHAT_API_PROFILE=excel
```

Không thử alias sau timeout: tránh phản hồi không có request ID bị nhầm. Socket cũ được thay trước khi tái sử dụng kênh có timeout. Không thay API giáo viên hay tạo ACK giả.

## Kiểm thử đã thực hiện

Node.js 22.16.0, Linux. `npm test`: 242 tests, 240 pass, 0 fail, 2 skip do thiếu Redux Toolkit. 18 test mới: 17 pass, 1 skip. Test P1 gồm hợp nhất 150 tin lịch sử, tin trùng nội dung, đối chiếu nhầm hội thoại, timeout lịch sử/online, group ACK, rời nhóm, lập kế hoạch reconnect, và server localhost thật để kiểm tra port conflict/child failure. TypeScript được kiểm tra riêng các service đã thay đổi bằng tsc 5.8.3 với khai báo ImportMeta tối thiểu. Full build và ESLint chưa xác minh vì thiếu Vite/types/ESLint trong môi trường. Test WebSocket dùng mock; test runner Vite dùng fixture mô phỏng tiến trình, không phải Vite thật. Cần chạy lại trên Windows với Node 24 và dependencies hiện tại.

## Kiểm thử thực tế bắt buộc

1. Hai tài khoản A và B gửi liên tiếp, gửi hai tin giống nhau; F5 ở cả hai máy; không được mất hay trùng các tin có ID server.
2. Tải trang 1, 2, 3, làm mới trang 1; dữ liệu cũ phải còn. Thử lịch sử có nhiều tin đến trong lúc offline.
3. Hai thành viên nhóm gửi nội dung giống nhau. Không được xác nhận từ ACK người khác. Rời nhóm trong lúc lịch sử đang tải; không thấy nhóm/tin cũ xuất hiện lại.
4. Ngắt kết nối, cho tài khoản khác gửi vào nhiều hội thoại, kết nối lại. Kiểm tra danh bạ, hội thoại đang mở, hội thoại cache và thay đổi actionTime.
5. Kiểm tra chuyển tài khoản, logout khi request đang chờ, không có tin của phiên trước.
6. Chạy dev:full hai lần: lần thứ hai cần báo port đang sử dụng, không đóng tiến trình đang chạy. Dừng bằng Ctrl+C, chạy lại. Kiểm tra cổng 8787 bằng netstat.
7. Kiểm tra npm test (242/242 mong muốn), build, lint và audit. Không push nếu lỗi hồi quy.

## Giới hạn còn lại

- API không cung cấp request ID, idempotency key, delivery/read receipt; một số broadcast thiếu ID/time. Tương quan chính xác tuyệt đối không thể đảm bảo chỉ từ nội dung. Các trường hợp không đủ căn cứ vẫn có thể có tin tạm và tin lịch sử cùng tồn tại; không đánh dấu unconfirmed là thành công từ lịch sử. Không tự gửi lại mutation.
- Timestamp dùng quy ước hiện có của dự án (UTC nếu không có offset); ngưỡng 2 giây là lựa chọn bảo thủ. Khi độ lệch vượt ngưỡng hoặc số bản ghi không khớp, giữ tin tạm thay vì xóa nhầm tin.
- Reconnect dùng actionTime do GET_USER_LIST cung cấp. Nếu actionTime không đổi/thiếu hoặc dữ liệu chưa từng được tải, không thể xác định chính xác tất cả tin bỏ lỡ. Backfill tối đa 10 trang mỗi lượt; nếu thiếu dữ liệu cần tải thêm hoặc làm mới. Unread ở hội thoại chưa có baseline vẫn mang giới hạn hiện tại.
- Bộ đệm nhóm ngắn hạn không thay thế lịch sử máy chủ. Nếu hết TTL hoặc vượt giới hạn thì phải lấy lịch sử để phục hồi.
- Media Server vẫn fail closed khi chưa có gateway HMAC xác thực và kiểm tra quyền. Không đổi 25 MiB/tệp, 10 upload đồng thời, không quota lưu trữ. Không bật media trái phép.
- IDE hoặc hệ điều hành cưỡng bức kết thúc parent mà không phát tín hiệu có thể để lại process con; không tự động kill process ngoài dự án. Test trên Windows là cần thiết.
- Bản vá giữ nguyên package-lock đã được npm audit fix trên máy người dùng; audit mới không được chạy thành công trong môi trường thiếu thư viện. Không chứng nhận production khi chưa kiểm thử thật.
