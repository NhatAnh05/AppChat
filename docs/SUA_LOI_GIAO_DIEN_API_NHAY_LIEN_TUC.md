# Khắc phục giao diện chat lặp và nhật ký API liên tục

## Biểu hiện từ ảnh người dùng

- Trong một cửa sổ chat xuất hiện nhiều hàng `Tin nhắn` / `Công cụ` và nhiều trạng thái `Đang tải lịch sử tin nhắn...`.
- Nhật ký WebSocket cập nhật nhiều lần với `GET_PEOPLE_CHAT_MES` và `CHECK_USER_ONLINE`.

## Những sửa đổi trong lần này

1. `MessageList.tsx`/`App.css`: tách thanh công cụ khỏi vùng cuộn nội dung; tin nhắn cuộn trong đúng một khung có `min-height:0` và `overflow-y:auto`. Không dùng các quy tắc ép co hàng tin nhắn.
2. `ChatWindow.tsx`: tải trang đầu khi chọn chat, sau đó đồng bộ dự phòng **tối đa mỗi 60 giây** nếu ứng dụng đang hiện, có kết nối và API lịch sử được hỗ trợ. Không còn refresh theo sự kiện `focus`.
3. `App.tsx`: chỉ kiểm tra trạng thái của người đang chat, tối đa mỗi 120 giây; không còn dò luân phiên người trong danh bạ 15 giây/lần.
4. `App.tsx`: giữ nhật ký trong một `ref`; không cập nhật React state cho từng WebSocket frame khi cửa sổ Nhật ký đóng. Khi mở Nhật ký, các dòng gần nhất được hiển thị; khi mở modal, log vẫn cập nhật trực tiếp.
5. Bổ sung test hồi quy để kiểm tra cấu trúc vùng cuộn và tần suất gửi API.

## Thử trên WebStorm

```powershell
npm ci
npm test
npm run build
npm run dev:full
```

Mở `http://localhost:5173/chat`, nhấn `Ctrl+Shift+R` để tải lại trang. Nếu chưa thấy bản sửa, hãy dừng Vite trước khi khởi chạy lại.

1. Chọn một chat đã có lịch sử dài. Màn hình chỉ có **một** thanh `Tin nhắn / Công cụ`, tin nhắn cuộn bên dưới thanh này.
2. Đổi người chat liên tục 5 lần, mở và đóng `Công cụ`, thử 3–5 phút.
3. Mở **Nhật ký API**. Không còn chuỗi dò nhiều người dùng liên tục; lịch sử chỉ đồng bộ lại khi cần theo giới hạn trên.
4. Gửi tin A → B, B → A; kiểm tra người nhận hiển thị ngay khi có broadcast `SEND_CHAT`. Với server không broadcast đầy đủ, đồng bộ lịch sử là phương án dự phòng, **không thể bảo đảm nhận ngay lập tức**.
5. Khi server không hỗ trợ một API, ứng dụng vẫn dừng dò API đó theo cơ chế đã có từ phiên bản trước.

Nếu bạn vẫn thấy nhiều thanh `Công cụ`, mở Console của trình duyệt (F12) và chạy:

```javascript
({
  toolbars: document.querySelectorAll('.lyra-workspace-toolbar').length,
  timelines: document.querySelectorAll('.message-list').length,
  appRoots: document.querySelectorAll('#root').length
})
```

Thông thường kết quả phải là `{toolbars: 1, timelines: 1, appRoots: 1}` khi đã mở một cuộc trò chuyện. Nếu số lượng cao hơn, hãy gửi kết quả này và Console log để phân biệt React bị mount lặp với lỗi trình duyệt vẽ lại vùng cuộn.

## Giới hạn đã kiểm tra

- Kiểm tra TypeScript và bộ test Node.js cục bộ thành công.
- Chưa kiểm chứng end-to-end với hai tài khoản và backend production của giảng viên trong môi trường này.
- Không thay đổi tên hoặc cấu trúc API WebSocket; không tự giả lập trạng thái online hay tin nhắn.
