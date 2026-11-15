/** Định dạng chính thức gửi tới WebSocket giảng viên, không dùng server giả lập. */
export type ChatCommand =
  | 'GET_USER_LIST' | 'CREATE_ROOM' | 'JOIN_ROOM' | 'OUT_ROOM'
  | 'CHAT_PEOPLE_GET_MES' | 'SEND_CHAT'
  | 'CHAT_CHECK_USER_ONLINE' | 'CHAT_CHECK_USER_EXIST' | 'LOGOUT';

export function makeChatRequest(event: ChatCommand, data: Record<string, unknown> = {}) {
  return { action: 'onchat' as const, data: { event, data } };
}

export function makeTextMessageRequest(recipient: string, message: string, group = false) {
  const to = recipient.trim();
  const mes = message.trim();
  if (!to || !mes) throw new Error('Thiếu người nhận hoặc nội dung tin nhắn.');
  return makeChatRequest('SEND_CHAT', { type: group ? 'room' : 'people', to, mes });
}

/** Bảng API giảng viên (02/11/2026): cả chat cá nhân và phòng đều dùng CHAT_PEOPLE_GET_MES. */
export function makeHistoryRequest(recipient: string, page = 1, group = false) {
  const name = recipient.trim();
  if (!name) throw new Error('Thiếu tên cuộc trò chuyện.');
  if (!Number.isInteger(page) || page < 1) throw new Error('Trang lịch sử phải >= 1.');
  void group; // tên event không thay đổi; backend phân biệt bằng tên người dùng hoặc tên phòng.
  return makeChatRequest('CHAT_PEOPLE_GET_MES', { name, page });
}
