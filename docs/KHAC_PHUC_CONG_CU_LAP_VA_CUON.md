# Khắc phục lỗi thanh công cụ lặp trong cửa sổ chat

## Triệu chứng
- Thanh “Tin nhắn / Công cụ” xuất hiện thành nhiều hàng, cắt ngang ảnh/tin nhắn.
- Nhật ký API có `ACTION_NOT_EXIT` cho `CHAT_PEOPLE_GET_MES`, rồi `GET_PEOPLE_CHAT_MES` thành công.

## Nguyên nhân và hướng xử lý
- Component chỉ có **một** `MessageList`; không có bằng chứng nhiều danh sách tin được mount đồng thời. Các thanh lặp trong ảnh có thể liên quan đến việc vẽ lại vùng cuộn trên trình duyệt. Không thể khẳng định nguyên nhân duy nhất từ ảnh.
- Xóa thanh công cụ khỏi luồng bố cục vùng tin nhắn; thêm nút **Công cụ** duy nhất lên header. Hộp thoại công cụ chỉ mount khi nhấn nút và được render bằng `createPortal` vào `document.body`.
- Thay `bottomRef.scrollIntoView({behavior:'smooth'})` bằng cuộn trực tiếp `listRef.scrollTop = listRef.scrollHeight`, tránh cuộn ancestor, tránh làm gián đoạn khi người dùng đang đọc tin cũ.
- Khi chuyển đến tin nhắn gốc, cuộn tương đối trong `message-list` thay vì gọi `scrollIntoView` trên toàn trang.
- Giữ nguyên chức năng Tìm kiếm, Đã lưu, Ảnh & tệp, Chọn nhiều và Chuyển tiếp.
- **Không sửa các event của server**, vì ảnh API cho thấy fallback `GET_PEOPLE_CHAT_MES` đã trả `success`.

## Cách kiểm tra trên WebStorm
1. Sao lưu repository hiện tại, thay các file bằng bản ZIP hoặc áp dụng bản vá.
2. Chạy `npm ci`, `npm test`, `npm run build`, `npm run dev:full`.
3. Mở `http://localhost:5173/chat`, nhấn `Ctrl+Shift+R`, chọn cuộc trò chuyện có nhiều tin nhắn/ảnh.
4. Xác nhận header chỉ có một nút Công cụ, không còn thanh công cụ trong vùng tin; nhấn Công cụ để bật hộp thoại, chuyển giữa các tab.
5. Cuộn tin nhắn lên/xuống; tin nhắn và ảnh không được bị cắt ngang bởi toolbar.
6. Mở DevTools → Console và nhập:

```js
console.log({
  tools: document.querySelectorAll('.chat-tools-trigger').length,
  oldToolbars: document.querySelectorAll('.lyra-workspace-toolbar').length,
  messageLists: document.querySelectorAll('.message-list').length
});
```

Khi mở một hội thoại và chưa mở hộp thoại công cụ, dự kiến `{tools: 1, oldToolbars: 0, messageLists: 1}`.

## Nếu ảnh vẫn bị “bóng ma” trên Edge
- Kiểm tra các số đếm DOM trên trước. Nếu chỉ có 1 nút/1 danh sách nhưng ảnh vẫn lặp, đó có thể là lỗi vẽ lại của trình duyệt/GPU.
- Thử mở cùng trang bằng Chrome hoặc Edge InPrivate. Để chẩn đoán, thử tắt tăng tốc đồ họa trong Edge Settings → System and performance, rồi khởi động lại trình duyệt.
- Gửi ảnh Console và số đếm DOM để phân biệt lỗi render React với lỗi vẽ của trình duyệt.

## Phạm vi xác minh
- `node --experimental-strip-types --test tests/*.test.mjs`: 197/197 thành công.
- `tsc -b`: thành công.
- Đã xem bố cục tĩnh trong Chromium ở kích thước desktop; chưa chạy kiểm thử end-to-end trực tiếp trên máy bạn/giảng viên.
