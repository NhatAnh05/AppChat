# AppChat — Không tự đăng xuất khi WebSocket mất kết nối tạm thời

## Nguồn hợp đồng

`chat_API.xlsx`, sheet `0Sheet1`: hàng 3 `LOGIN`, hàng 4 `RE_LOGIN`, hàng 5 `LOGOUT`.

- `LOGIN` gửi `action:onchat / event:LOGIN / data:{user,pass}` và nhận `RE_LOGIN_CODE` từ Backend.
- `RE_LOGIN` gửi `action:onchat / event:RE_LOGIN / data:{user,code}`; thành công trả `RE_LOGIN_CODE` **mới**, thay mã đã lưu.
- Backend có thể từ chối với `Re-Login error, session expired!`; theo tài liệu, phiên khôi phục trong phạm vi hai giờ.
- `LOGOUT` gửi `action:onchat / event:LOGOUT` không kèm trường `data`; khi người dùng chủ động đăng xuất, phiên cục bộ phải được xóa.

## Lỗi và thay đổi

Trước đây, khi `RE_LOGIN` thất bại ba lần do mất mạng, `loginService.ts` xóa mã phiên và phát `signed-out`; `App.tsx` điều hướng người dùng về `/login`. Khi tải lại trang, `AuthInitializer.tsx` cũng xóa Redux credentials nếu mọi lần reconnect đều thất bại. Hai tình huống này không phải xác nhận phiên hết hạn từ Backend.

- Nếu Backend **từ chối RE_LOGIN rõ ràng** hoặc phiên lưu trong tab đã hết hạn: kết thúc phiên và chuyển đến trang đăng nhập.
- Nếu mạng gián đoạn, kết nối đóng hoặc timeout: giữ sessionStorage và giao diện chat, hiển thị `Đang khôi phục kết nối...` rồi `Tạm mất kết nối — phiên đăng nhập vẫn được giữ`.
- Thử RE_LOGIN tối đa 3 lần mỗi đợt. Sau 3 thất bại vì mạng, tạm dừng và hẹn thử lại với giãn cách 20–120 giây; thử ngay khi có sự kiện `online`, `focus` hoặc quay lại tab.
- Khi Backend chấp nhận RE_LOGIN, mã mới từ `data.RE_LOGIN_CODE` được lưu thay mã cũ, và thao tác WebSocket được thực hiện trên socket đã xác thực.
- Khi bấm Đăng xuất, dừng toàn bộ retry/timer và xóa phiên; sự kiện mạng khôi phục không được tự đăng nhập lại.
- Không thay giao diện đăng nhập, không thêm endpoint và không giả lập `RE_LOGIN_CODE`.

## Kiểm thử

```powershell
cd C:\Users\ASUS\Downloads\AppChat-main\AppChat-main
npm test
npm run build
npm run dev
```

Các tình huống cần kiểm thử bằng hai tài khoản thật:
1. Đăng nhập thành công; để trang chat ở trạng thái không thao tác, chờ và xác nhận không bị đẩy về `/login` khi mạng ổn định.
2. Tạm ngắt mạng: hiển thị trạng thái mất kết nối, **không logout**. Bật lại mạng: tự RE_LOGIN, trở lại chat.
3. F5 khi mất mạng: giao diện vẫn giữ tab đang đăng nhập, nhưng thao tác API phải báo không có kết nối chứ không giả thành công.
4. Đăng xuất bằng nút: về `/login` và không tự hồi phục phiên khi có mạng.
5. Phiên bị Backend trả `session expired!`: về `/login` và cần đăng nhập mới. Không thể vượt qua giới hạn phiên của server bằng frontend.

### Giới hạn

Các unit test dùng WebSocket giả lập; cần đối chiếu `F12 → Network → WS → Messages` với Backend thật. Khi chia sẻ log, không cung cấp `RE_LOGIN_CODE` hay mật khẩu. Production build cần môi trường npm đã cài dependencies.
