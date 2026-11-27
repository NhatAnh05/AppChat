# Nâng cấp chức năng nhóm – LyraChat

## Mục tiêu

Phần quản lý nhóm hỗ trợ ba nghiệp vụ chính từ API WebSocket hiện có: **CREATE_ROOM** (tạo nhóm), **JOIN_ROOM** (tham gia nhóm) và **OUT_ROOM** (rời nhóm). Chỉ cập nhật giao diện sau khi máy chủ xác nhận thành công; không giả lập membership khi máy chủ không phản hồi.

## Các file đã thêm hoặc chỉnh

| File | Công việc |
| --- | --- |
| `src/components/GroupDashboard.tsx` | Trang quản lý nhóm, ô tìm kiếm, sắp xếp, chia sẻ hướng dẫn tham gia, xác nhận rời nhóm |
| `src/services/groupManagement.ts` | Các hàm chuẩn hóa tên, tìm kiếm tiếng Việt, định dạng thông báo lỗi, tạo ContactEntry |
| `src/App.tsx` | Ghép trang quản lý nhóm và xử lý Redux sau xác nhận API |
| `src/components/ChatWindow.tsx` | Danh sách thành viên, trạng thái tải, xác nhận rời nhóm ngay trong thông tin nhóm |
| `src/components/ContactDirectory.tsx` | Mở nhóm trực tiếp từ danh bạ, bên cạnh nút tạo/tham gia |
| `src/components/ChatList.tsx` | Chế độ hiển thị chỉ nhóm, tránh tìm username khi đang ở tab Nhóm |
| `src/features/contacts/contactsSlice.ts` | Tránh nhóm trùng tên do khác chữ hoa/thường, xóa nhóm không phân biệt chữ hoa/thường |
| `src/App.css` | Giao diện desktop, điện thoại, dark mode, trạng thái lỗi và xác nhận |
| `tests/groupManagement.test.mjs` | Kiểm thử các hàm tiện ích và trường hợp lỗi |

## Chạy dự án bằng WebStorm

1. Mở WebStorm → `File > Open`, chọn thư mục **AppChat** có `package.json`.
2. Mở Terminal, kiểm tra `node -v`, `npm -v`. Vite 8 yêu cầu Node từ 20.19 hoặc từ 22.12 trở lên. Khuyên dùng Node.js 22.x phù hợp.
3. Chạy `npm ci` để cài chính xác dependency trong `package-lock.json`.
4. Chạy `npm run dev:full` để mở frontend và media server. Nếu chỉ test chat nhóm (không gửi file), có thể chạy `npm run dev`.
5. Truy cập `http://localhost:5173/chat` (Vite có thể chuyển sang cổng khác nếu cổng này bận).
6. Đăng nhập bằng tài khoản hợp lệ trên server chat của giảng viên.

## Kiểm thử ba nghiệp vụ bằng hai tài khoản

**Tạo nhóm (API CREATE_ROOM)**

1. Tài khoản A chọn **Nhóm** ở sidebar → **Tạo nhóm mới**.
2. Nhập tên chưa tồn tại, ví dụ `Nhom TH Lap Trinh Mang`.
3. Ứng dụng chờ server trả `CREATE_ROOM` thành công, sau đó mới thêm nhóm vào danh sách và mở chat.
4. Thử tạo trùng tên: UI phải hiển thị lỗi, không tự tạo thêm nhóm.

**Tham gia nhóm (API JOIN_ROOM)**

1. A mở trang Nhóm → nút **Chia sẻ** để copy tên và cách tham gia.
2. Tài khoản B chọn **Nhóm** → **Tham gia nhóm** và nhập đúng tên.
3. Chỉ sau `JOIN_ROOM` thành công mới có nhóm trong danh sách và mở chat.
4. Thử tên sai: UI hiển thị lỗi, danh sách nhóm không thay đổi.

**Rời nhóm (API OUT_ROOM)**

1. B ở trang **Nhóm**, bấm **Rời nhóm** trên thẻ nhóm, hoặc mở chat → **Thông tin nhóm** → **Rời nhóm**.
2. Ứng dụng yêu cầu xác nhận lần hai.
3. Sau khi server phản hồi thành công, Redux mới xóa nhóm, dữ liệu lịch sử cục bộ của hội thoại và các chỉ số chưa đọc.
4. Nếu B hủy hoặc server từ chối (ví dụ chủ phòng), nhóm vẫn được giữ trong danh sách.

## Chạy kiểm thử

- `npm test` – chạy toàn bộ kiểm thử, bao gồm những test sẵn có của repo.
- `node --experimental-strip-types --test tests/groupManagement.test.mjs tests/createRoom.test.mjs tests/roomChatProtocol.test.mjs tests/roomChatService.test.mjs` – kiểm tra các phần liên quan nhóm.
- `npm run build` – kiểm tra TypeScript và tạo bản build.

**Lưu ý:** Repository gốc đã có một số bài test không qua ở phần khác (realtime/history). Không đánh đồng test của module nhóm qua với việc đã xác nhận khả năng hoạt động trên backend thực tế.

## Giới hạn API

- API tham gia chỉ nhận `name` nên chưa có link mời nhóm, tìm nhóm công khai hay mời trực tiếp bằng username.
- Không có API đổi tên, chuyển quyền chủ phòng hoặc xóa nhóm. Không nên dựng UI hứa hẹn các chức năng đó.
- Phản hồi OUT_ROOM không chứa ID yêu cầu; code xếp tuần tự các lệnh cùng sự kiện nhưng vẫn cần kiểm thử mạng thật, nhất là khi kết nối chập chờn.
- Chức năng copy hướng dẫn dùng Clipboard API, thường khả dụng ở `localhost` hoặc HTTPS.

## Đề xuất nội dung commit

**Summary:** `feat: Hoàn thiện tạo nhóm, tham gia nhóm và rời nhóm qua WebSocket`

**Description:**

- Thiết kế trang quản lý nhóm với tìm kiếm, sắp xếp, chia sẻ tên phòng và làm mới danh sách.
- Kết nối CREATE_ROOM, JOIN_ROOM, OUT_ROOM với Redux và điều hướng nhóm.
- Bổ sung xác nhận rời nhóm, trạng thái chờ, xử lý lỗi từ máy chủ.
- Cải thiện giao diện nhóm trên desktop, màn hình nhỏ và chế độ tối.
- Thêm kiểm thử và hướng dẫn sử dụng cho 3 luồng nhóm.

## Giữ nguyên lịch sử GitHub

Nếu đã clone repo bằng GitHub Desktop, **không xóa thư mục `.git`**. Chỉ chép các file từ gói ZIP vào repository đang clone, thay thế file trùng tên, sau đó kiểm tra `Changes` và commit. Số commit cũ vẫn được giữ khi bạn tạo commit mới theo cách thông thường.
