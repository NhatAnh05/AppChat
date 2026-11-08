/** Chuẩn hóa dữ liệu chat trả về từ API của giảng viên. Không tự suy đoán ACK. */
export interface ServerChatMessage {
  id?: string | number;
  name: string;
  to: string;
  mes: string;
  createAt?: string;
  type: 0 | 1;
}

function record(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
}
const string = (value: unknown) => typeof value === 'string' ? value : '';

export function parseServerChatMessage(input: unknown): ServerChatMessage | null {
  const data = record(input);
  if (!data) return null;
  const name = string(data.name).trim();
  const to = string(data.to).trim();
  const mes = string(data.mes);
  // Một ACK chỉ có status/event không phải tin nhắn và không được đánh dấu đã lưu.
  if (!name || !to || !mes.trim()) return null;
  const type = data.type === 'room' || Number(data.type) === 1 ? 1 : 0;
  const id = typeof data.id === 'string' || typeof data.id === 'number' ? data.id : undefined;
  const createAt = typeof data.createAt === 'string' ? data.createAt : undefined;
  return { id, name, to, mes, type, ...(createAt ? {createAt} : {}) };
}

export function parseChatHistory(input: unknown): ServerChatMessage[] | null {
  const payload = record(input);
  // API chat 1:1 trả data: []; phòng có thể trả data: {chatMess: []}.
  const rows = Array.isArray(input) ? input : payload && Array.isArray(payload.chatMess) ? payload.chatMess : null;
  if (!rows) return null;
  return rows.map(parseServerChatMessage).filter((m): m is ServerChatMessage => m !== null);
}

export function belongsToConversation(message: ServerChatMessage, currentUser: string, conversationId: string): boolean {
  if (message.type === 1) return conversationId === `room:${message.to}`;
  if (message.name !== currentUser && message.to !== currentUser) return false;
  const peer = message.name === currentUser ? message.to : message.name;
  return conversationId === `people:${peer}`;
}
