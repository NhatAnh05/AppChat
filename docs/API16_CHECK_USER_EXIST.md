# API 16 – Kiểm tra tài khoản tồn tại

- Gửi `CHAT_CHECK_USER_EXIST`, `data: { "user": "ti" }` qua action `onchat`.
- Phản hồi `CHECK_USER_EXIST`, `status: "success"`, `data: { "status": true }` nếu tồn tại; `false` nếu không tồn tại.
- Các giao diện tìm người dùng dùng chung `userService.checkUserExist`, tránh gửi nhầm event `CHECK_USER_EXIST`.
- API cần socket đã đăng nhập. Phản hồi không có request ID nên các lần kiểm tra được xếp hàng để tránh gán nhầm.
- Đây là kiểm tra tài khoản, không phải API tìm kiếm gần đúng hay cung cấp hồ sơ.
- Chưa thử trực tiếp trên backend production.
