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
const normalName = (value: string) => value.trim().toLocaleLowerCase();
export const sameChatUser = (left: string, right: string): boolean =>
  Boolean(left.trim() && right.trim()) && normalName(left) === normalName(right);


export function parseServerChatMessage(input: unknown): ServerChatMessage | null {
  const outer = record(input);
  if (!outer) return null;
  // Một số WebSocket adapter lồng nội dung vào data thêm một lớp.
  // Chỉ mở một lớp khi bản thân object ngoài không có nội dung tin hợp lệ.
  const data = (outer.name === undefined && outer.to === undefined && record(outer.data))
    ? record(outer.data)! : outer;
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

/**
 * Route a real-time packet to the correct chat, including username casing
 * differences between LOGIN, GET_USER_LIST and SEND_CHAT.
 * Do not create a conversation if neither participant is the logged-in user.
 */
export function resolveRealtimeConversationId(
  message: ServerChatMessage,
  currentUser: string,
  existingConversationIds: readonly string[] = [],
): string | null {
  const group = message.type === 1;
  if (!group && !sameChatUser(message.name, currentUser) && !sameChatUser(message.to, currentUser)) return null;
  const peer = group ? message.to : sameChatUser(message.name, currentUser) ? message.to : message.name;
  const prefix = group ? 'room:' : 'people:';
  const existing = existingConversationIds.find(id => id.startsWith(prefix) && sameChatUser(id.slice(prefix.length), peer));
  return existing ?? `${prefix}${peer}`;
}

export function belongsToConversation(message: ServerChatMessage, currentUser: string, conversationId: string): boolean {
  return resolveRealtimeConversationId(message, currentUser, [conversationId]) === conversationId;
}

/** ACK requires an explicit chat type and the full sender/target/content tuple.
 * Accept the same one-layer adapter envelope as realtime messages. */
export function parseSendAcknowledgement(input: unknown): ServerChatMessage | null {
  const outer = record(input);
  if (!outer) return null;
  const row = outer.name === undefined && outer.to === undefined ? record(outer.data) ?? outer : outer;
  if (![0, '0', 'people', 1, '1', 'room'].includes(row.type as string | number)) return null;
  if (row.id !== undefined && !(typeof row.id === 'string' && row.id.trim() || typeof row.id === 'number' && Number.isSafeInteger(row.id))) return null;
  return parseServerChatMessage(row);
}
