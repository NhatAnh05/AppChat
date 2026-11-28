# LyraChat — bản vá P0

Bản vá dựa trên `AppChat.zip` và `API_Chat_WebSocket.xlsx` (hàng 2–16). Giữ nguyên endpoint WebSocket giảng viên, JSON envelope, tên event và chính sách tương thích API hiện tại. Không sửa các tính năng P1–P3 ngoài các điều kiện an toàn cần thiết cho P0.

## Cách áp dụng

Giải nén ZIP vào thư mục gốc AppChat đang mở trong GitHub Desktop, ghi đè các tệp trùng tên. ZIP chỉ chứa tệp mới và tệp thay đổi, không có `.git`, `node_modules`, dữ liệu upload hoặc mật khẩu. Kiểm tra Changes trước khi commit.

```sh
npm ci
npm test
npm run build
npm run dev
```

Kiểm thử riêng P0 (Node 22+):

```sh
node --experimental-strip-types --test tests/p0*.test.mjs
```

## P0.01 — cô lập dữ liệu Redux

- `store/store.ts`: root reducer reset đồng thời auth, danh bạ, tin nhắn, lịch sử khi clear credentials hoặc đổi user. Bỏ qua cập nhật contacts/messages trong trạng thái chưa đăng nhập.
- `messagesSlice.ts`: thêm resetMessages; mỗi lần tải lịch sử giữ requestId; bỏ qua fulfilled/rejected không khớp request hiện hành, kể cả sau khi rời nhóm hoặc chuyển tài khoản.
- Workspace theo key userId. Tác vụ async chỉ cập nhật dữ liệu khi scope phiên vẫn hiện hành.

## P0.02 — quản lý vòng đời phiên

- `sessionScope.ts`: AbortController độc lập cho mỗi phiên; sessionQueue bỏ hàng đợi cũ, từ chối task cũ ngay khi đổi phiên. Reconnect cùng tài khoản không làm mất scope.
- `loginService.ts` và `logoutService.ts`: invalidate scope khi login/logout/phiên hết hạn; dừng recovery cũ; logout đến muộn không xóa phiên mới.
- Các service gửi tin, history, danh bạ, tạo/join/leave room, kiểm tra user và probe API kiểm tra scope trước khi gửi; hủy listeners/timer khi phiên kết thúc.
- UI kiểm tra scope trước/sau thao tác async, kể cả upload, chuyển tiếp, reaction, import lịch sử và polling.

## P0.03 — không xác nhận nhầm tin cũ

API 13/14 không có client request ID; mẫu response cá nhân ở hàng 14 mô tả forward cho người nhận, không đảm bảo ACK cho người gửi. Không thể chứng minh chính xác request tương ứng từ lịch sử trùng nội dung, kể cả một dòng mới do tab khác gửi.

- Bỏ fallback xác nhận thành công từ lịch sử có cùng nội dung.
- ACK cá nhân phải đúng sender, recipient, nội dung, loại; bỏ qua ID đã biết hoặc đã xác nhận trên cùng socket. ACK thiếu ID vẫn được hỗ trợ theo mẫu Excel; không thể chống tuyệt đối broadcast lặp không có ID từ máy chủ.
- Sau timeout/mất kết nối, thông báo `UnconfirmedSendError`, không tự gửi lại; làm mới lịch sử để người dùng xem dữ liệu thực có trên server. Lịch sử không được coi là ACK. Lần gửi cá nhân tiếp theo tự mở lại kết nối xác thực qua RE_LOGIN nếu socket cũ đã có ACK không rõ ràng; không tự gửi lại tin cũ.
- Nhóm kiểm tra sender của broadcast trước khi xác nhận.
- Cần thử trực tiếp 2 tài khoản. Nếu production không gửi ACK, tin có thể vẫn lưu và xuất hiện qua lịch sử nhưng lần gửi hiển thị chưa xác nhận. P1 tiếp tục hoàn thiện trạng thái tin nhắn/reconciliation, reconnect và pagination. Bảo đảm tương quan chính xác tuyệt đối cần backend cấp request ID/idempotency key hoặc ACK có định danh.

## P0.04 — bảo mật Media Server

**Mặc định khóa tất cả thao tác media (HTTP 503) nếu thiếu `MEDIA_GATEWAY_SECRET`.** API giảng viên không có HTTP auth hoặc API cấp token media; không dùng username hoặc RE_LOGIN_CODE do browser tự cung cấp làm bằng chứng. Bản vá triển khai kiểm tra chữ ký, phân quyền và giới hạn tài nguyên ở Media Server, nhưng chưa có gateway xác thực thực tế. Không đưa media ra Internet trước khi tích hợp gateway. `npm run dev:full` một mình không bật được upload/download nữa. Chat văn bản không cần gateway.

### Yêu cầu với gateway (bắt buộc)

1. Gateway HTTPS cùng origin với Frontend; xác thực người dùng bằng cơ chế đáng tin cậy, đồng bộ identity với tài khoản chat, từ chối phiên đã logout/hết hạn. Cookie HttpOnly/Secure/SameSite và kiểm tra CSRF/Origin cho POST.
2. Gateway xóa header `X-Lyra-Media-Authorization` đến từ browser. Chỉ gateway mới tạo header chữ ký sau khi xác thực và kiểm tra quyền thật sự trên từng request; không cấp secret hoặc token ký cho Frontend.
3. URL upload: `/api/media/files/<scope>`; URL download: `/api/media/files/<scope>/<uuid.ext>`. `scope` = base64url(UTF-8 JSON), canonical:
   - Chat cá nhân: `["people","alice","bob"]` với username viết thường, trim, sắp thứ tự; gateway kiểm tra user là một trong hai tài khoản hợp lệ.
   - Chat nhóm: `["room","team"]`; gateway kiểm tra membership hiện tại từ nguồn dữ liệu server đáng tin cậy, trên cả POST và GET. Không tin danh sách thành viên do Frontend gửi. Media Server dựa vào gateway cho quyền phòng nhóm.
4. Header nội bộ có định dạng `base64url(JSON claim).hex(HMAC_SHA256(secret, base64url(JSON claim)))`. Claim gồm `user` canonical, `method` (POST/GET), `path` chính xác và `exp` Unix giây (tối đa 60 giây). Ví dụ code phía gateway **chỉ sau khi đã xác thực/phân quyền**, không dùng như gateway hoàn chỉnh:

```js
import { createHmac } from 'node:crypto';
const claim = { user: verifiedUser, method: req.method, path: verifiedPath, exp: Math.floor(Date.now()/1000)+30 };
const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
const signature = createHmac('sha256', process.env.MEDIA_GATEWAY_SECRET).update(payload).digest('hex');
// Gắn vào request nội bộ gửi tới media server, không trả về browser.
const authorization = `${payload}.${signature}`;
```

5. `MEDIA_GATEWAY_SECRET` là secret ngẫu nhiên mạnh (tối thiểu 32 byte), đặt trong environment của gateway và media server, không đưa vào `VITE_*`/Git. Sinh bằng `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. `MEDIA_HOST` bắt buộc loopback; `MEDIA_PORT` mặc định 8787. Reverse proxy phải bảo đảm giới hạn kích thước, rate limit ở biên, không ghi log token, không cache riêng tư. Frontend `VITE_MEDIA_PUBLIC_BASE_URL` phải cùng origin.

### Giới hạn tài nguyên đã áp dụng

- 25 MiB/tệp; không giới hạn dung lượng theo tài khoản hoặc tổng thư mục ở tầng ứng dụng; không giới hạn số bản ghi tệp/metadata; tối đa 10 upload đồng thời (toàn bộ tiến trình); 10 POST/phút/người, 120 GET/phút/người và 600 request đã xác thực/phút toàn server.
- Giới hạn thời gian HTTP, kiểm tra Content-Length, kiểm tra chữ ký định dạng cơ bản, tên tệp UUID, quyền file 0600, metadata owner/scope. GET kiểm tra scope trùng metadata. Cache private no-store, nosniff; tài liệu/tệp không phải ảnh/video được gửi dạng attachment.
- File cũ không có metadata quyền bị khóa, không tự xóa hoặc chuyển quyền. Cần migration do quản trị viên xác minh owner/scope. Dung lượng thực tế phụ thuộc ổ đĩa; quản trị viên phải theo dõi dung lượng trống, số inode, cảnh báo đầy đĩa và dọn dữ liệu theo chính sách. Không hỗ trợ nhiều tiến trình dùng chung thư mục; nếu triển khai phân tán cần cơ chế rate limit chung. Kiểm tra chữ ký file không phải antivirus, không giải nén hoặc phân tích đầy đủ nội dung Office/ZIP/video; bổ sung scan khi triển khai thực tế.
- Frontend gửi scope URL, dùng cookie cùng origin, không còn header cố định `X-Lyra-Upload: 1`. Upload bị hủy khi đổi phiên; không gửi link cũ từ account khác.

## Kiểm thử thủ công

- A chat với C, đăng xuất A, đăng nhập B, mở C: không thấy tin cũ A; lịch sử B được tải mới.
- Đăng xuất lúc nhiều thao tác đang chờ, đăng nhập B: xem Nhật ký API không có request của A gửi trên phiên B.
- Gửi hai tin giống nhau; thử server không ACK; không tự hiển thị thành công từ tin cũ; kiểm tra lịch sử trước khi gửi lại. Sau lần gửi chưa xác nhận, lần gửi tiếp theo phải dùng socket mới nếu socket cũ còn hoạt động.
- Kiểm tra media không có gateway bị khóa; khi tích hợp gateway, A/B thuộc cuộc trò chuyện được đọc, C không được; giả mạo MIME/size/rate bị từ chối; kiểm tra logout và rời nhóm.

## Kết quả trong môi trường sửa

- Baseline: 212/213 test đạt; test `userExistApi16.test.mjs` thất bại từ mã nguồn gốc (P1.09, chưa sửa).
- Bản vá: 222 test, 220 đạt, 1 lỗi P1.09 sẵn có, 1 skip vì không có Redux Toolkit. 8/9 bài kiểm thử P0 mới đạt (1 skip Redux).
- Các service TypeScript thay đổi được kiểm tra `tsc --noEmit` bằng khai báo môi trường Vite tối thiểu.
- `npm ci --offline` thất bại do cache thiếu gói; full build không chạy được vì thiếu vite/client và @types/node. Chưa kiểm thử giao diện bằng trình duyệt, production server giảng viên hoặc gateway thật. Không coi P0.04 là hoàn tất vận hành production trước khi gateway được tích hợp và test quyền thực tế.


## Kiểm tra trước push — bản AppChat (2)

- Đã đối chiếu 24/24 tệp của bản vá P0 cũ với ZIP người dùng cung cấp.
- Bỏ quota theo tài khoản, tổng dung lượng và số bản ghi tệp/metadata; tối đa 10 upload đồng thời toàn tiến trình. Giữ giới hạn 25 MiB/tệp, rate limit, kiểm tra MIME và xác thực HMAC. Với 10 upload lớn, cần theo dõi RAM (buffer upload có thể lên tới hàng trăm MiB), ổ đĩa và inode. Không có gateway thật thì media vẫn khóa; không bỏ điều kiện này để bật media.
- Sửa thêm P1.09: UserSearchDialog dùng userService.checkUserExist, bảo vệ phiên và bỏ qua kết quả cũ.
- Thêm 2 test HTTP thực tế: dữ liệu thưa giả lập > 2 GiB vẫn upload được; 10 request đang tải đồng thời được chấp nhận, request thứ 11 nhận 429, slot được giải phóng khi upload hoàn thành. Cả hai đạt.
- Kết quả npm test: 224 test, 223 đạt, 0 fail, 1 skip (Redux Toolkit không đầy đủ). npm run build vẫn thiếu vite/client và @types/node; npm ci --offline không thành công vì cache thiếu gói. Chưa xác minh build production, trình duyệt, API giảng viên hoặc gateway thật.
- Thêm quy tắc .gitignore/.dockerignore cho .env, .env.* (trừ .env.example), server/uploads/. ZIP người dùng có 7 tệp upload đã được Git theo dõi; thêm ignore không loại chúng khỏi index. Trước push, chạy `git rm -r --cached --ignore-unmatch server/uploads` tại thư mục dự án (giữ file trên máy, bỏ theo dõi Git). Nếu dữ liệu riêng tư đã được commit trước đây, việc bỏ theo dõi không xóa lịch sử Git; cần đánh giá lịch sử và quyền truy cập repo. Không đưa secret vào Git.
- Trước push: `npm ci`, `npm test` (không còn skip), `npm run build`, kiểm thử hai tài khoản thật (đăng xuất/đổi tài khoản, tin nhắn chờ, history). Chỉ xác nhận deploy media khi gateway được triển khai và kiểm thử quyền thực tế.
