# P2 — Đợt 1 (sau P1 Hotfix 3)

Áp dụng chồng các tệp trong ZIP vào thư mục gốc AppChat. Không thay package-lock, dữ liệu uploads, hoặc cấu hình IDE. Dùng cùng cấu hình WebStorm `dev:full-local` (Arguments `-- --local-media --port 5174 --strictPort`, Environment `MEDIA_PORT=8788`). Chế độ local chỉ dành cho tệp mẫu trên cùng máy. Production vẫn fail closed nếu thiếu gateway xác thực và phân quyền theo hội thoại.

## Thay đổi
- Gửi tối đa 5 ảnh/tệp trong một lần chọn (hoặc kéo thả/dán nhiều tệp); upload tuần tự, gom thành một tin nhiều đính kèm; gửi ảnh/video đơn vẫn dùng envelope cũ. Bộ đọc hỗ trợ URL cũ, envelope đơn và nhiều phần tử. Mỗi tệp tối đa 25 MiB, server vẫn tối đa 10 upload đồng thời và không có quota lưu trữ. Nếu upload giữa chừng thất bại, không gửi album dở; những tệp đã upload có thể còn trên đĩa, không tự gửi lại. Hai phía nên dùng cùng phiên bản LyraChat.
- Ghi âm bằng MediaRecorder (WebM/Opus hoặc MP4 tùy trình duyệt), cần cấp quyền micro; Dừng rồi Gửi ghi âm hoặc Hủy, tối đa 2 phút, tự giải phóng microphone khi rời hội thoại hoặc đổi phiên. MIME được chuẩn hóa. File được gửi qua cùng Media Server; không ghi âm tự động. Kiểm tra bằng mic thật trên Windows.
- HTTP GET có xác thực/capability hỗ trợ một byte range, trả 206/416, không thay đổi quyền truy cập. Nếu có If-Range mà không có validator hỗ trợ, trả toàn bộ file. Không hỗ trợ multi-range.
- Media chuyển tiếp giữ tên và dung lượng. Không chuyển tiếp trực tiếp URL `/api/media/` có quyền riêng của hội thoại; cần tải và gửi lại nếu có quyền. Sao chép không kèm URL nội bộ. Search dùng tên file/preview thay vì JSON thô.
- Chuỗi literal trùng marker emoji cũ được escape bằng LYRA_TEXT_V2 trước khi gửi. Decode một lần; vẫn đọc lịch sử emoji cũ. Các chuỗi cũ không có dấu phân biệt không thể khôi phục tuyệt đối; client khác có thể hiển thị mã transport. Kiểm tra giới hạn 10000 ký tự sau mã hóa.
- Reply trích dẫn media dễ đọc; nhảy đến ID đã reconcile nếu có, nếu không có tin gốc hiển thị thông báo tải thêm. Reaction dùng alias reconcile; ID tạm và bản sao không được làm đích reaction/reply. Cần kiểm thử trường hợp thiếu ACK thực tế.
- Không tính reaction/bản sao vào chưa đọc, không tính trang lịch sử cũ; phân biệt hai server ID cùng nội dung, dùng reconciledLiveId khi đổi ID. Lưu watermark thời gian, desktop notification dedup theo tài khoản. Bản ledger cũ được đọc tương thích; không tái tạo lịch sử đếm cũ đã sai.
- Sao lưu live app: nhập tối đa 8 MiB, kiểm tra tài khoản và hội thoại hiện có, lọc field, namespace unverified:backup, không nhập reaction/ACK giả. Khi server trả đúng ID, bản sao nhường bản ghi chính thức. Bản sao chứa nội dung tin và có thể chứa link media có mã truy cập: giữ riêng tư. Chỉ dùng trên tài khoản chính chủ; không phải cơ chế server backup.
- Chuẩn hóa danh bạ cùng tên khác hoa/thường trong snapshot, giữ cách viết server và actionTime mới hơn; sắp xếp danh sách theo hoạt động server và tin đã tải. Draft V2 giữ text gốc, migrate reply draft cũ.

## Kiểm thử
`npm.cmd test` (kỳ vọng 277 test), `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd audit`.
Môi trường tạo vá: 277 test đạt, TypeScript/ESLint đạt. Vite build bị chặn do Rolldown native binding Linux không có trong dependencies Windows. Trình duyệt Chromium chặn điều hướng harness, chưa xác minh bố cục album/ghi âm bằng browser. Kiểm thử HTTP audio dùng dữ liệu giả lập có chữ ký container, không phải kiểm thử phát audio thật.

## Kiểm tra thủ công
1. Dùng 2 tài khoản/hồ sơ trình duyệt riêng, cùng máy. Health `/api/media/local/health` phải trả local-sandbox.
2. Chọn 2–5 ảnh và tệp mẫu, kiểm tra album đủ số tệp, tên/dung lượng; thử quá 5 tệp, một tệp >25 MiB. Không upload dữ liệu nhạy cảm.
3. Bấm mic, cấp quyền, nói ngắn, Dừng rồi Gửi ghi âm; phía nhận phát audio. Thử Hủy, đổi hội thoại và đăng xuất khi đang ghi; microphone phải dừng.
4. Phát video/audio và tua; DevTools Network kiểm tra 206 nếu browser yêu cầu Range.
5. Gửi literal LYE1f600X và emoji 😀, xem ở hai phía và F5. Thử reply album, reaction, mở lịch sử cũ, hai tin giống nhau nhưng ID khác nhau.
6. Xuất/nhập bản sao test; bản sao không tạo unread/ACK, không nhập chéo tài khoản, không hiển thị nhóm ngoài danh bạ hiện tại. Nhập lại không trùng.
7. Mở lịch sử nhóm, gửi/nhận và thử reconnect để hồi quy P1.

## Chưa xử lý hoàn toàn
- P2.01/P2.02: Docker/Nginx, media liên thiết bị và gateway production. API giảng viên chưa cung cấp xác thực/phân quyền media cho gateway. Không dùng local sandbox công khai, không đặt secret vào biến VITE_*. Cần tích hợp backend đáng tin cậy, HTTPS, storage volume, reverse proxy chỉ chuyển claim đã xác thực; không chỉ expose cổng 8787/8788.
- P2.03/P2.04: gọi thoại/video. CallOverlay và signaling demo hiện có chưa xác thực danh tính tài khoản; không bật chúng cho production. Cần signaling xác thực và TURN/ICE thích hợp. Ghi âm không phải gọi thoại.
- P2.07/P2.08: chỉ cải thiện alias ID và UX reply; cần server thật để xác minh ACK, không tạo receipt giả.
- P2.09: client khác chưa có codec có thể hiện mã emoji/album; cần Unicode và đặc tả chung backend để tương thích hoàn toàn.
- P2.14: URL web bình thường không có đuôi media vẫn là text; URL-only lịch sử có đuôi file vẫn được nhận diện để tương thích. Không thể phân biệt toàn bộ link văn bản và tệp cũ chỉ dựa trên URL.
- P2.16: đã sửa từ P1, cần thử trên server thật.
- P2.17: chưa migrate toàn bộ khóa localStorage cũ khác hoa/thường (tránh gộp nhầm tài khoản); chỉ dedup snapshot danh bạ.
- Chưa test giao tiếp API giảng viên bằng tài khoản thật trong đợt này; không đóng P1 ACK/online thật hoặc P0 gateway.
