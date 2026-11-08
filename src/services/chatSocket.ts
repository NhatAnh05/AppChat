/** Giao thức WebSocket của máy chủ môn học. */
import { getAuthenticatedSocket } from './loginService';
import { makeChatRequest, type ChatCommand } from './chatProtocol';

export type ChatEvent = ChatCommand;
export type ServerPacket = { status?: string; event?: string; data?: unknown; mes?: string };
const listeners = new Set<(packet: ServerPacket) => void>();
// Chỉ lưu tên lệnh để hỗ trợ chẩn đoán, tuyệt đối không ghi password, session code hay nội dung tin.
type Diagnostic = { at: number; direction: 'send' | 'receive'; event: string; status?: string };
const diagnostics: Diagnostic[] = [];
function remember(entry: Diagnostic): void {
  diagnostics.push(entry);
  if (diagnostics.length > 60) diagnostics.shift();
}
export function getChatDiagnostics(): Diagnostic[] { return [...diagnostics]; }
export function getRecentChatCommands(): string[] {
  const threshold = Date.now() - 15000;
  return [...new Set(diagnostics.filter(x => x.direction === 'send' && x.at >= threshold).map(x => x.event))];
}
let attachedSocket: WebSocket | null = null;
const handler = (message: MessageEvent) => {
  if (typeof message.data !== 'string') return;
  try {
    const packet = JSON.parse(message.data) as ServerPacket;
    if (packet && typeof packet === 'object') {
      remember({at: Date.now(), direction: 'receive', event: packet.event || 'UNKNOWN', status: packet.status});
      listeners.forEach(listener => listener(packet));
    }
  } catch { /* Bỏ qua thông điệp không phải JSON. */ }
};
export function attachChatSocket(): void {
  const socket = getAuthenticatedSocket();
  if (socket === attachedSocket) return;
  if (attachedSocket) attachedSocket.removeEventListener('message', handler);
  attachedSocket = socket;
  if (socket) socket.addEventListener('message', handler);
}
export function subscribeChat(listener: (packet: ServerPacket) => void): () => void {
  listeners.add(listener);
  attachChatSocket();
  return () => { listeners.delete(listener); };
}
export function sendChatEvent(event: ChatEvent, data: Record<string, unknown> = {}): void {
  attachChatSocket();
  const socket = getAuthenticatedSocket();
  if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Mất kết nối máy chủ. Vui lòng đăng nhập lại.');
  socket.send(JSON.stringify(makeChatRequest(event, data)));
  remember({at: Date.now(), direction: 'send', event});
}
export function getError(packet: ServerPacket): string {
  return packet.mes || `Máy chủ từ chối thao tác ${packet.event ?? ''}.`;
}
