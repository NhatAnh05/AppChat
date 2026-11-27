# Sửa API 11 – CHAT_PEOPLE_GET_MES (Room)

## Giao thức theo tài liệu giảng viên

**Request** (lấy lịch sử nhóm ABC, trang 1):

```json
{"action":"onchat","data":{"event":"CHAT_PEOPLE_GET_MES","data":{"name":"ABC","page":1}}}
```

**Success** (`CHAT_PEOPLE_GET_MES`):

```json
{"status":"success","event":"CHAT_PEOPLE_GET_MES","data":{"name":"ABC","user":[{"id":1,"name":"long"}],"chatMess":[{"id":101,"name":"long","to":"ABC","mes":"Hello room","createAt":"2026-11-02 10:00:00","type":1}]}}
```

**Error** (`GET_ROOM_CHAT_MES`, khác tên event với request):

```json
{"status":"error","event":"GET_ROOM_CHAT_MES","mes":"Room not found or You not in room"}
```

## Các thay đổi

- `src/services/roomChatProtocol.ts`: tạo request đúng event `CHAT_PEOPLE_GET_MES`, đọc `data.name`, `data.user` và `data.chatMess`.
- `src/services/chatHistoryTransport.ts`: ưu tiên duy nhất event request của tài liệu cho nhóm; lắng nghe cả `CHAT_PEOPLE_GET_MES` thành công và `GET_ROOM_CHAT_MES` lỗi; vẫn dùng hàng đợi để tránh lấy nhầm phản hồi giữa các cuộc trò chuyện.
- `src/services/chatApiEvents.ts`: chú thích lại vai trò hai event để tránh nhầm tên.
- Các test giao thức và tích hợp: xác nhận cả phản hồi thành công và lỗi.

## Kiểm thử nhanh trong WebStorm

1. `npm install` và `npm test`.
2. `npm run dev:full`.
3. Đăng nhập, vào một nhóm có thật, kiểm tra trang lịch sử.
4. Yêu cầu lịch sử nhóm không tồn tại hoặc chưa tham gia, xác nhận ứng dụng hiển thị lỗi server.
5. Kiểm tra nhật ký API: request `CHAT_PEOPLE_GET_MES` có `name`, `page`; khi thành công, phản hồi mang event `CHAT_PEOPLE_GET_MES` và `chatMess`.

**Giới hạn**: kiểm thử tự động dùng WebSocket mô phỏng; chưa chứng minh API production hoạt động trên phiên đăng nhập thực tế.
