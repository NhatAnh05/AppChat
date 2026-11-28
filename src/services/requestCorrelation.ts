import { ensureLoginConnection } from './loginService.ts';
import { websocketService } from './websocket.ts';
import { sessionQueue, assertCurrentSession } from './sessionScope.ts';
export const enqueueAuthenticatedRequest = sessionQueue();
export type RequestChannel = 'send' | 'probe' | 'room-membership' | 'contacts';
const uncertain = new WeakMap<WebSocket, Set<RequestChannel>>();
export function quarantineResponse(socket: WebSocket | null, channel: RequestChannel): void {
  if (!socket) return;
  const channels = uncertain.get(socket) ?? new Set<RequestChannel>();
  channels.add(channel); uncertain.set(socket, channels);
}
/** Re-authenticate before reusing an ambiguous response channel. Never resend a mutation. */
export async function ensureCorrelatedConnection(session: AbortSignal, channel: RequestChannel): Promise<void> {
  await ensureLoginConnection(session);
  assertCurrentSession(session);
  const socket = websocketService.getSocket();
  if (socket && uncertain.get(socket)?.has(channel)) {
    socket.close();
    await ensureLoginConnection(session);
    assertCurrentSession(session);
    if (websocketService.getSocket() === socket) throw new Error('Chưa thể làm mới kết nối không rõ trạng thái.');
  }
}
export class UnconfirmedSendError extends Error {}
