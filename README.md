# ĐẶC TẢ THIẾT KẾ GIAO DIỆN — APPCHAT WEB

**Phiên bản:** 1.0 — UI only  
**Ngày lập:** 31/10/2026  
**Nền tảng:** Web, responsive cho desktop / tablet / mobile  
**Công nghệ trình bày:** React + TypeScript + SCSS + Vite  
**Trạng thái:** Nguyên mẫu giao diện, chưa tích hợp API.

---

## 1. Mục đích và phạm vi

### 1.1. Mục tiêu

Thiết kế giao diện AppChat theo hướng **ứng dụng nhắn tin thực tế**, lấy cảm hứng từ kiểu bố cục của Messenger/Zalo Web mà không sao chép thương hiệu, logo hoặc giao diện cụ thể. Giao diện cần mạch lạc, dễ thao tác, cân đối thông tin, có đầy đủ vị trí hiển thị chức năng phổ biến của ứng dụng chat hiện đại và sẵn sàng để đội phát triển tích hợp API khi được cấp.

### 1.2. Có trong phạm vi bản này

1. React component thể hiện giao diện và bố cục.
2. SCSS gồm design tokens, hiệu ứng focus/hover, trạng thái chọn và responsive.
3. Nội dung **tĩnh** để trình bày ảnh đại diện, hội thoại, tin nhắn, tệp và ảnh mẫu.
4. State giao diện đơn giản: chuyển mục, chọn một hội thoại minh họa, lọc danh sách, tìm nội dung **đang hiển thị**, đóng/mở sidebar thông tin, hộp thoại và bảng emoji.
5. Đặc tả thiết kế bằng Markdown này.

### 1.3. Ngoài phạm vi (không được hiểu là đã xây dựng)

- Backend, cơ sở dữ liệu, API, WebSocket/real-time, push notification.
- Đăng ký, đăng nhập và phân quyền thực.
- Gửi/nhận/lưu/đồng bộ tin nhắn thật; đánh dấu đã đọc thật.
- Tạo, xóa, lưu trữ, ghim, chặn hay báo cáo hội thoại thật.
- Upload, tải file, xem ảnh do người dùng gửi, phát nội dung media.
- Gọi thoại/video và xử lý WebRTC.
- Xử lý lỗi server, phân trang và quản lý trạng thái nghiệp vụ.
- Mock API, fake service, Zustand, Axios, localStorage, persistence.

> **Quy tắc triển khai:** Các nút nghiệp vụ chỉ là thành phần hình ảnh. Tránh để thao tác giả tạo cảm giác đã lưu/gửi thành công. Những tương tác có thể dùng để xem trước layout phải được giới hạn trong UI.

## 2. Hướng thiết kế

### 2.1. Nguyên tắc

- **Đơn giản nhưng không sơ sài:** tinh giảm thẻ màu, không dùng gradient lớn hoặc các khối dashboard trang trí; phân cấp bằng font, spacing và độ tương phản.
- **Tính thực dụng:** tin chưa đọc nhìn thấy ngay; tên/tin cuối/thời gian không bị lẫn; thao tác quan trọng nằm gần bối cảnh.
- **Ưu tiên nội dung:** phần lớn diện tích dành cho tin nhắn; không để bảng thông tin cố định chiếm quá nhiều màn hình.
- **Khả năng mở rộng:** thành phần avatar, tin nhắn, hội thoại, modal tách biệt để kết nối dữ liệu thật sau này.
- **Không “AI demo”:** tránh nhiều card nổi, badge màu dày đặc, chú thích không cần thiết hoặc menu vô nghĩa.

### 2.2. Tham chiếu hành vi phổ biến

Lấy cảm hứng từ các **mẫu tương tác chung** của các ứng dụng chat hiện đại: thanh điều hướng, danh sách hội thoại, khung tin nhắn hai phía, avatar, trạng thái hoạt động, badge chưa đọc, bảng chia sẻ file, nhóm và menu thông tin. Đây là định hướng trải nghiệm, không phải yêu cầu tái hiện chính xác một ứng dụng có bản quyền.

## 3. Hệ thống thiết kế (Design System)

### 3.1. Màu sắc

| Token | Giá trị | Vai trò |
|---|---|---|
| `--primary` | `#2165D6` | Nút chính, tab chọn, tin nhắn gửi |
| `--ink` | `#263345` | Tiêu đề, nội dung quan trọng |
| `--muted` | `#84909F` | Nội dung phụ, thời gian |
| `--border` | `#E8ECF1` | Đường phân tách |
| `--soft` | `#F4F6F9` | Nền tìm kiếm, tin nhận |
| `--white` | `#FFFFFF` | Mặt nền chính |
| `--rail` | `#F9FAFC` | Thanh điều hướng |
| **Online** | `#38B67D` | Chấm trạng thái hoạt động |
| **Chưa đọc** | `#2466D7` | Số tin chưa đọc |

### 3.2. Chữ

- Font chính: **Be Vietnam Pro**; fallback `system-ui`, `Segoe UI`, sans-serif.
- Tiêu đề trang: khoảng 25 px / 800.
- Tên hội thoại, tiêu đề header: 12–14 px / 700.
- Nội dung tin nhắn: 11–12 px / 400, line-height xấp xỉ 1.8.
- Thời gian và chú thích: 9–11 px / 400–600.
- Không dùng nhiều font khác nhau; ưu tiên chữ rõ ở kích thước nhỏ.

### 3.3. Spacing, góc bo và icon

- Spacing quy chuẩn: 4, 8, 12, 16, 20, 24 px.
- Bo góc cho ô nhập, nút và item: 10–13 px; modal: 17 px.
- Bubbles tin nhắn: góc bo 13 px, một góc nhỏ để chỉ chiều chat.
- Icon dạng outline, kích thước chủ yếu 18–21 px (Lucide).
- Đường viền một pixel màu xám nhạt; không lạm dụng box-shadow.

### 3.4. Trạng thái tương tác

| Trạng thái | Đặc tả |
|---|---|
| Default | Nền trắng/xám rất nhạt, chữ tối |
| Hover | Nền nhạt tăng độ tương phản, không thay layout |
| Focus keyboard | Viền focus dễ thấy, không bỏ outline |
| Selected | Nền xanh rất nhạt và text tương phản |
| Disabled | Giảm opacity nhưng không giả báo thành công |
| Unread | Chữ tin cuối đậm + badge số lượng |
| Online | Chấm xanh ở góc avatar |
| Empty | Hình tượng đơn giản, giải thích và lối đi tiếp theo |

## 4. Kiến trúc thông tin và bố cục

### 4.1. Sơ đồ bố cục desktop

```text
┌──────────┬─────────────────────────┬──────────────────────────────────────┬─────────────────────┐
│          │ APPCHAT / MESSENGER     │ Header: Avatar + tên + trạng thái   │ Thông tin hội thoại │
│  Rail    │ Tin nhắn                │           Call / Search / Info       │                     │
│          ├─────────────────────────┼──────────────────────────────────────┤ Avatar + tên         │
│  Chat    │ Tìm kiếm                │                                      │ Quick actions       │
│  Danh bạ │ Tất cả  Chưa đọc  Nhóm  │         Ngày / Thời gian             │ Thành viên          │
│  Lưu trữ ├─────────────────────────┤                                      │ Ảnh/video           │
│          │                         │           Tin người nhận             │ Tệp đã chia sẻ      │
│          │ Danh sách hội thoại     │                 Tin của tôi          │ Quyền riêng tư      │
│          │                         │                                      │                     │
│          │                         ├──────────────────────────────────────┤                     │
│  Cài đặt │                         │  [+] [File] [Emoji]  [Nhập ...] [Gửi]│                     │
└──────────┴─────────────────────────┴──────────────────────────────────────┴─────────────────────┘
```

Bảng thông tin **mặc định đóng**, người dùng mở khi cần để bảo toàn không gian nội dung chat.

### 4.2. Kích thước mục tiêu

| Vùng | Desktop | Tablet | Mobile |
|---|---:|---:|---:|
| Thanh điều hướng | 78 px | 60–68 px | Ẩn để tiết kiệm chiều ngang |
| Sidebar | 369 px | 310–330 px | 100% width khi đang xem danh sách |
| Main chat | Phần còn lại | Phần còn lại | 100% width khi mở chat |
| Info panel | 308 px (đóng/mở) | Overlay 320 px | Overlay gần đầy màn hình |
| Header chat | 83 px | 72–83 px | 72 px |

### 4.3. Responsive và điều hướng

- **>= 1300 px:** ba vùng khi người dùng mở info panel; rail + sidebar + chat khi đóng.
- **1110–1299 px:** sidebar thu nhỏ; info panel thành overlay nổi từ phải.
- **761–1109 px:** rail hẹp, sidebar hẹp; info panel overlay.
- **<= 760 px:** chỉ xem **sidebar** hoặc **chat** tại một thời điểm. Chọn chat để chuyển trang, nút quay lại trong header.
- **<= 500 px:** rail ẩn, nút gọi thoại/video được lược bớt ở header để tránh chật; vẫn xem được tin nhắn và khung soạn.

## 5. Đặc tả từng khu vực

### 5.1. Thanh điều hướng (Rail)

**Thành phần:** logo AppChat, Tin nhắn, Danh bạ, Lưu trữ, Cài đặt, Avatar cá nhân.

**UI cần có:** item đang chọn; hover/focus; chú thích qua thuộc tính `title`/`aria-label`; badge thông báo minh họa.

**Trong bản UI:** chuyển tab Tin nhắn/Danh bạ/Lưu trữ là tương tác hiển thị cục bộ. Không có routing hoặc tải dữ liệu server.

### 5.2. Sidebar / danh sách hội thoại

**Thành phần:**

- Tiêu đề `Tin nhắn`, nút `Tin nhắn mới`, menu tùy chọn.
- Ô tìm kiếm: placeholder `Tìm kiếm cuộc trò chuyện`.
- Tab `Tất cả` / `Chưa đọc` / `Nhóm`.
- Mỗi hội thoại: avatar, tên, tin cuối, thời gian, badge chưa đọc, trạng thái online, icon ghim/tắt thông báo nếu cần.
- Trạng thái không có kết quả.

**Cách hiển thị item:**

| Phần | Quy tắc |
|---|---|
| Avatar | 48 px, chấm xanh ở góc phải dưới nếu online |
| Tên | Một dòng, cắt ellipsis khi dài |
| Tin nhắn cuối | Một dòng, cắt ellipsis |
| Thời gian | Căn phải, nhỏ hơn tên |
| Badge chưa đọc | Nổi bật nhưng không chiếm quá nhiều diện tích |
| Selected item | Nền `#EDF3FD` |
| Hover item | Nền `#F7F9FC` |

**Tương tác trong bản thiết kế:** chọn chat đổi nội dung minh họa; nhập tìm kiếm lọc danh sách **cố định**; tab lọc chỉ làm thay đổi những item hiển thị.

### 5.3. Header cuộc trò chuyện

Gồm avatar, tên đối phương/nhóm, trạng thái hoạt động hoặc số thành viên, icon gọi thoại, gọi video, tìm trong hội thoại, mở thông tin.

- Tên nhóm hoặc tên người dài phải cắt ellipsis, không đẩy icon khỏi màn hình.
- Trạng thái `Đang hoạt động` có màu phụ nhẹ, không lấn át tên.
- Nút Info dùng để mở panel phải.
- Nút tìm kiếm mở thanh tìm trong tin nhắn **đang hiển thị**.
- Nút gọi mở **modal thiết kế cuộc gọi**, không kết nối cuộc gọi.

### 5.4. Khu vực tin nhắn

**Nguyên tắc:** tin nhắn người khác ở trái, tin nhắn của tôi ở phải. Tin nhắn mẫu có thời gian và trạng thái đã đọc minh họa.

| Loại | Trình bày |
|---|---|
| Văn bản nhận | Nền xám nhạt, chữ sẫm, căn trái |
| Văn bản gửi | Nền xanh, chữ trắng, căn phải |
| Tin trả lời | Trích dẫn phía trên bubble |
| Hình ảnh | Thumbnail và caption, không tải ảnh thật |
| Tệp | Icon tệp + tên + dung lượng |
| Reaction | Biểu tượng nhỏ chồng ở mép bubble |
| Đã đọc | Dấu hai tick minh họa bên thời gian |
| Ngày | Label ở giữa luồng |
| Nội dung dài | Tự xuống dòng, không tràn viewport |

**Các trạng thái cần thiết kế khi triển khai sau này:** đang tải, mất kết nối, gửi thất bại, tin đã thu hồi, tin đang gửi, chưa có tin nhắn, tải thêm tin cũ. Bản hiện tại mới minh họa một số trạng thái nội dung phổ biến; không diễn giải các trạng thái trên thành logic.

### 5.5. Composer / khung soạn tin

**UI:** nút thêm, icon đính kèm, icon emoji, textarea, nút gửi.

- Input có thể nhập văn bản để kiểm tra sự co giãn, focus và layout.
- Nút emoji mở bảng biểu tượng cảm xúc mẫu; chọn biểu tượng chỉ chèn vào textarea tạm.
- Nút gửi không gửi và không tạo tin nhắn mới.
- Nút đính kèm không upload.
- Dòng chú thích nhỏ `Chế độ thiết kế · không gửi tin nhắn` nhằm tránh hiểu nhầm.

**Định hướng khi làm logic thật:** Enter để gửi; Shift+Enter xuống dòng; hiển thị trạng thái gửi; validate độ dài và file type theo API, nhưng các xử lý này **chưa được viết**.

### 5.6. Panel thông tin hội thoại

- Avatar, tên, trạng thái/số thành viên.
- Hành động nhanh: tìm kiếm, thông báo, quyền riêng tư (UI).
- Nhóm accordion: thành viên, ảnh/video, tệp đã chia sẻ, quyền riêng tư.
- Ảnh thumbnail và file list dùng nội dung placeholder.
- Nút đóng ở header; trên tablet/mobile hiển thị overlay từ phải.

### 5.7. Danh bạ

- Tiêu đề `Danh bạ` và tìm liên hệ.
- Danh sách người dùng với avatar, tên, trạng thái online.
- Bản này là **màn hình danh bạ trình bày tĩnh**, chưa có nút mời kết bạn, xem hồ sơ, quản lý liên hệ hay API.

### 5.8. Lưu trữ

- Có mục `Đã lưu trữ` trong rail; hiển thị hội thoại được đánh dấu là đã lưu trữ trong dữ liệu trình bày.
- Chưa có hành động lưu trữ hoặc khôi phục thực tế.

### 5.9. Modal tạo tin nhắn mới

- Tiêu đề, ô tìm người nhận, danh sách gợi ý, hình ảnh vòng chọn người nhận.
- Ô tìm lọc phần **tên hiển thị**; không tạo hội thoại, không thêm người và không gửi yêu cầu Backend.
- Trong tương lai có thể thêm chế độ chọn nhiều người và tên nhóm.

### 5.10. Modal cài đặt và modal gọi

- Cài đặt: hồ sơ mẫu, thông báo, chủ đề, quyền riêng tư — trình bày bằng hàng thông tin và switch *không hoạt động*.
- Gọi: ô hình ảnh cuộc gọi và thông báo thiết kế; chưa có ghi âm, video, microphone hay WebRTC.

## 6. Các màn hình và trạng thái nên bổ sung khi có API

Bảng sau là **backlog thiết kế/triển khai tương lai**, không phải chức năng đã có:

| Màn hình/trạng thái | Kỳ vọng trình bày | Ưu tiên |
|---|---|---|
| Đăng nhập / Đăng ký | Form, validation, lỗi xác thực | Cao |
| Loading list | Skeleton 5–6 hội thoại | Cao |
| Chưa có cuộc trò chuyện | Empty state có CTA | Cao |
| Tin đang gửi / lỗi | Pending, retry, icon cảnh báo | Cao |
| Không có mạng | Banner trạng thái reconnect | Cao |
| File upload | Preview, tiến trình, lỗi kích thước | Trung bình |
| Message context menu | Trả lời, sao chép, chỉnh sửa, thu hồi | Trung bình |
| Tạo nhóm | Chọn người, nhập tên, ảnh nhóm | Trung bình |
| Ảnh fullscreen | Lightbox, điều hướng ảnh | Trung bình |
| Thông báo | Popover/tùy chọn âm thanh | Trung bình |
| Gọi thoại/video | Giao diện kết nối, mute/camera, kết thúc | Tùy API |
| Chủ đề tối | Bảng màu dark mode | Thấp |

## 7. Component map và cách tách file

| File | Vai trò | Đầu vào liên quan |
|---|---|---|
| `src/App.tsx` | Lắp bố cục + state xem trước UI | selected, section, modal, details |
| `src/components/Rail.tsx` | Điều hướng bên trái | active section |
| `src/components/Sidebar.tsx` | Danh sách và bộ lọc hội thoại | conversation list, filter, search |
| `src/components/ChatPanel.tsx` | Header, thread và composer | active chat, visible messages |
| `src/components/DetailsPanel.tsx` | Thông tin cuộc trò chuyện | active chat |
| `src/components/Avatar.tsx` | Avatar tái sử dụng | initial/color/size/presence |
| `src/data/previewContent.ts` | Chuỗi dữ liệu tĩnh phục vụ thiết kế | không có API |
| `src/styles/main.scss` | Tất cả quy tắc styling và breakpoint | tokens, layouts, states |

**Không tạo** các file `apiClient`, `chatService`, `messageService`, `useChatStore`, `authStore`, `mockApi`, `websocket` ở giai đoạn thiết kế.

## 8. Luồng xem trước (chỉ UI)

```text
Mở AppChat
   └─> Xem danh sách hội thoại
         ├─> Chọn một hội thoại --> Xem tin nhắn mẫu
         │                            ├─> Mở/đóng panel thông tin
         │                            ├─> Tìm tin trong nội dung mẫu
         │                            ├─> Nhập văn bản thử (không gửi)
         │                            └─> Xem modal cuộc gọi
         ├─> Lọc Chưa đọc/Nhóm (dữ liệu cố định)
         ├─> Danh bạ (dữ liệu cố định)
         ├─> Lưu trữ (dữ liệu cố định)
         ├─> Xem modal tin nhắn mới
         └─> Xem modal cài đặt
```

## 9. Tiêu chí nghiệm thu phần thiết kế

- [ ] Dự án chạy với `npm install` + `npm run dev`.
- [ ] `npm run build` chạy không báo lỗi TypeScript.
- [ ] Có đủ rail, sidebar, header, vùng tin nhắn, composer, info panel.
- [ ] Sidebar thể hiện đủ avatar, tên, tin cuối, thời gian và badge.
- [ ] Tin nhắn gửi và nhận phân biệt rõ bằng vị trí/màu sắc.
- [ ] Có ví dụ về tin nhắn văn bản, ảnh, tệp, trả lời, reaction.
- [ ] Có UI trạng thái lựa chọn, hover, focus và rỗng.
- [ ] Có modal chat mới, cài đặt, cuộc gọi dạng minh họa.
- [ ] Layout responsive, không tràn ngang tại viewport 390 px, 768 px, 1280 px.
- [ ] Không có các service, endpoint, websocket, localStorage, store nghiệp vụ.
- [ ] Không có hành động nào báo đã gửi/lưu thành công nếu chưa có Backend.
- [ ] Source có thể mở rộng để tích hợp API mà không đổi ngôn ngữ thiết kế.

## 10. Quy ước triển khai khi nhận API

Tài liệu này **không tự định nghĩa endpoint**. Khi được cung cấp tài liệu chính thức, hãy tiến hành theo thứ tự:

1. Liệt kê các API thực tế mà Backend hỗ trợ và xác định auth, dữ liệu, quy tắc phân trang, realtime.
2. Tạo `types`/data mapper theo response và request thật.
3. Tạo service và state quản lý dữ liệu trong **giai đoạn riêng**, không sửa dữ liệu tĩnh vào vị trí API.
4. Thay fixture bằng props từ dữ liệu được tải; giữ nguyên cấu trúc component UI và token SCSS.
5. Chỉ kích hoạt các nút nghiệp vụ khi đã có endpoint/cơ chế tương ứng; đưa vào UI trạng thái loading, error và retry.
6. Kiểm thử responsive, accessibility, các luồng nhận/gửi thật và các lỗi từ Backend.

---

**Kết luận:** Bản AppChat này là **nguyên mẫu Frontend UI** được viết bằng React/TypeScript/SCSS và đi kèm đặc tả thiết kế. Nó không chứa logic nghiệp vụ hay mô phỏng API. Đây là tài liệu nền để phát triển một ứng dụng chat hoàn chỉnh sau khi nhận đặc tả Backend.
