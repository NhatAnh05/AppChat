/** Giao thức WebSocket của máy chủ môn học. */
import { getAuthenticatedSocket } from './loginService';
import { makeChatRequest, type ChatCommand } from './chatProtocol';

export type ChatEvent = ChatCommand;
export type ServerPacket = { status?: string; event?: string; data?: unknown; mes?: string };
const listeners = new Set<(packet: ServerPacket) => void>();
let attachedSocket: WebSocket | null = null;
const handler = (message: MessageEvent) => {
  if (typeof message.data !== 'string') return;
  try {
    const packet = JSON.parse(message.data) as ServerPacket;
    if (packet && typeof packet === 'object') listeners.forEach(listener => listener(packet));
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
}
export function getError(packet: ServerPacket): string {
  return packet.mes || `Máy chủ từ chối thao tác ${packet.event ?? ''}.`;
}
