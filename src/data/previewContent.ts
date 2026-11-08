/** DỮ LIỆU TRÌNH BÀY GIAO DIỆN — không phải API, không dùng làm dữ liệu nghiệp vụ. */
export type Presence = 'online' | 'away' | 'offline';
export type Conversation = {
  id: string;
  name: string;
  initial: string;
  color: string;
  avatar?: string;
  preview: string;
  time: string;
  unread: number;
  pinned?: boolean;
  muted?: boolean;
  group?: boolean;
  archived?: boolean;
  presence?: Presence;
  members?: string;
  memberNames?: string[];
};
export type Message = {
  id: string;
  fromMe: boolean;
  text?: string;
  time: string;
  /** Server timestamp for ordering and safe reconciliation (when provided). */
  createdAt?: string;
  /** Time the local browser attempted to send. Not proof of delivery. */
  clientSentAt?: number;
  /** Local receipt time for a broadcast lacking a server ID. */
  clientReceivedAt?: number;
  day?: string;
  attachment?: 'photo' | 'file';
  fileName?: string;
  fileDetail?: string;
  replyTo?: string;
  emoji?: string;
  seen?: boolean;
  edited?: boolean;
};
export const conversations: Conversation[] = [
  { id: 'linh', name: 'Nguyễn Thảo Linh', initial: 'L', color: '#9b728b', preview: 'Ừ vậy chốt chiều mai nha', time: '10:42', unread: 2, pinned: true, presence: 'online' },
  { id: 'design', name: 'Nhóm thiết kế sản phẩm', initial: 'D', color: '#637f99', preview: 'Minh: Mình đã gửi bản cập nhật', time: '09:18', unread: 4, pinned: true, group: true, members: '6 thành viên' },
  { id: 'minh', name: 'Trần Quốc Minh', initial: 'M', color: '#7b8a6b', preview: 'Bạn đã gửi một tệp', time: 'Hôm qua', unread: 0, presence: 'away' },
  { id: 'an', name: 'Hoàng Bảo An', initial: 'A', color: '#bf876d', preview: 'Cảm ơn bạn nhiều nhé!', time: 'Hôm qua', unread: 0, presence: 'online' },
  { id: 'project', name: 'Dự án Website 2026', initial: 'W', color: '#7d73a6', preview: 'Huy: Đã hoàn tất phần giao diện', time: 'Thứ 4', unread: 0, muted: true, group: true, members: '12 thành viên' },
  { id: 'phuong', name: 'Lê Thanh Phương', initial: 'P', color: '#b18a5f', preview: 'Bạn xem giúp mình với nhé', time: 'Thứ 3', unread: 0, presence: 'offline' },
  { id: 'hoa', name: 'Võ Thu Hòa', initial: 'H', color: '#7793a3', preview: 'Mình nhận được rồi ạ', time: '20/10', unread: 0, presence: 'offline' },
  { id: 'archive', name: 'Nhóm hội thảo', initial: 'S', color: '#8a95ad', preview: 'Lịch họp đã được cập nhật', time: '18/10', unread: 0, archived: true, group: true, members: '8 thành viên' },
];

export const sampleMessages: Record<string, Message[]> = {
  linh: [
    { id: 'l1', fromMe: false, text: 'Chào bạn, mình vừa xem qua phần giao diện mới rồi.', time: '09:26', day: 'Hôm nay' },
    { id: 'l2', fromMe: false, text: 'Phần danh sách chat nhìn gọn hơn nhiều đó 👌', time: '09:26' },
    { id: 'l3', fromMe: true, text: 'Cảm ơn Linh! Mình đang chỉnh lại phần thông tin hội thoại cho dễ sử dụng hơn.', time: '09:31', seen: true },
    { id: 'l4', fromMe: true, text: 'Bạn xem giúp mình bố cục này có ổn không?', time: '09:32', seen: true },
    { id: 'l5', fromMe: false, attachment: 'photo', time: '09:47' },
    { id: 'l6', fromMe: false, text: 'Mình nghĩ khung nhập tin nhắn có thể nhỏ hơn một chút.', time: '09:48', replyTo: 'Bạn xem giúp mình bố cục này có ổn không?' },
    { id: 'l7', fromMe: true, text: 'Ừ hợp lý đó, mình cũng đang nghĩ vậy.', time: '10:03', seen: true },
    { id: 'l8', fromMe: true, attachment: 'file', fileName: 'Giao-dien-AppChat.pdf', fileDetail: 'PDF · 2,4 MB', time: '10:04', seen: true },
    { id: 'l9', fromMe: false, text: 'Mình xem rồi nhé. Chiều mai trao đổi chi tiết hơn được không?', time: '10:40' },
    { id: 'l10', fromMe: true, text: 'Được, khoảng 2 giờ chiều nha.', time: '10:41', seen: true },
    { id: 'l11', fromMe: false, text: 'Ừ vậy chốt chiều mai nha', time: '10:42', emoji: '❤️' },
  ],
  design: [
    { id: 'd1', fromMe: false, text: 'Mọi người ơi, hôm nay mình tổng hợp feedback giao diện nhé.', time: '08:40', day: 'Hôm nay' },
    { id: 'd2', fromMe: true, text: 'Mình đã chỉnh lại các component theo hướng đơn giản hơn.', time: '08:54', seen: true },
    { id: 'd3', fromMe: false, text: 'Nhìn ổn hơn đó, nhớ bổ sung trạng thái không có tin nhắn nhé.', time: '09:01' },
    { id: 'd4', fromMe: false, text: 'Mình đã gửi bản cập nhật', time: '09:18', attachment: 'file', fileName: 'ui-review-notes.docx', fileDetail: 'Word · 184 KB' },
  ],
  minh: [
    { id: 'm1', fromMe: false, text: 'Mình gửi tài liệu để bạn tham khảo.', time: '16:20', day: 'Hôm qua' },
    { id: 'm2', fromMe: true, text: 'Cảm ơn Minh, mình đã tải về rồi.', time: '16:31', seen: true },
    { id: 'm3', fromMe: true, attachment: 'file', fileName: 'AppChat-UI-Spec.md', fileDetail: 'Markdown · 28 KB', time: '16:33', seen: true },
  ],
  an: [
    { id: 'a1', fromMe: false, text: 'Bản demo của bạn đẹp đấy!', time: '11:12', day: 'Hôm qua' },
    { id: 'a2', fromMe: true, text: 'Cảm ơn An, mình sẽ hoàn thiện thêm phần responsive.', time: '11:15', seen: true },
    { id: 'a3', fromMe: false, text: 'Cảm ơn bạn nhiều nhé!', time: '11:16' },
  ],
};

export const contacts = [
  { name: 'Nguyễn Thảo Linh', initial: 'L', color: '#9b728b', online: true },
  { name: 'Trần Quốc Minh', initial: 'M', color: '#7b8a6b', online: false },
  { name: 'Hoàng Bảo An', initial: 'A', color: '#bf876d', online: true },
  { name: 'Lê Thanh Phương', initial: 'P', color: '#b18a5f', online: false },
  { name: 'Võ Thu Hòa', initial: 'H', color: '#7793a3', online: false },
];
