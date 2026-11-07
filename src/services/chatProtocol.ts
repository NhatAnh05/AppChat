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
