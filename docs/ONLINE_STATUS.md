# Theo dõi Online/Offline (API 15)

- Theo tài liệu của giảng viên: gửi sự kiện `CHAT_CHECK_USER_ONLINE` với `{ "user": "username" }`; phản hồi có event `CHECK_USER_ONLINE` và `data.status: boolean`.
- App chỉ kiểm tra bạn chat cá nhân khi socket đã đăng nhập, trình duyệt đang hiển thị và có mạng. Tự quét 20 giây/lần, tối đa 20 người/lượt, luân phiên nếu nhiều hơn.
- Vì server không cung cấp request ID, request kiểm tra user được xếp tuần tự để tránh nhầm phản hồi giữa các username. `CHECK_USER_EXIST` cũng sử dụng sự kiện gửi `CHAT_CHECK_USER_EXIST` theo tài liệu.
- Nếu không lấy được phản hồi thì trạng thái để là `Chưa rõ trạng thái` nếu chưa từng nhận kết quả; không gán thành `Ngoại tuyến`.
- Dấu chấm xanh và chữ `Đang hoạt động` chỉ xuất hiện khi API trả `true`. `Ngoại tuyến` khi API trả `false`.
- Trạng thái đồng bộ trực tiếp ở danh bạ, danh sách cuộc trò chuyện và header/hồ sơ của chat đang mở.
- API không có broadcast presence và thời điểm online cuối; trạng thái có thể trễ tối thiểu đến chu kỳ kế tiếp. Không thể xác định `hoạt động X phút trước` từ tài liệu hiện tại.
- Kiểm tra thực tế: mở 2 trình duyệt với 2 tài khoản khác nhau; đăng nhập cả hai, xem chấm xanh; đăng xuất một tài khoản và theo dõi thay đổi trong chu kỳ; dùng Nhật ký API kiểm tra request/response.
