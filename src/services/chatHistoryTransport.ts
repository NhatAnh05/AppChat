/**
 * API contract: both people and room history use CHAT_PEOPLE_GET_MES.
 * The teacher server may return GET_ROOM_CHAT_MES for room errors.
 * There is no request ID in responses, so all history requests share ONE queue.
 */
import { ensureLoginConnection } from './loginService.ts';
import { websocketService, type WebSocketMessage } from './websocket.ts';

export const HISTORY_EVENT = 'CHAT_PEOPLE_GET_MES';
const ROOM_ERROR_EVENT = 'GET_ROOM_CHAT_MES';
type HistoryKind = 'people' | 'room';
let queue: Promise<void> = Promise.resolve();

export function historyResponseMatches(message: WebSocketMessage, kind: HistoryKind, name: string): boolean {
  if (message.event === ROOM_ERROR_EVENT) return kind === 'room' && message.status === 'error';
  if (message.event !== HISTORY_EVENT) return false;
  if (message.status === 'error') return true; // shared event; queue guarantees one outstanding request
  if (kind === 'people') return Array.isArray(message.data);
  if (!message.data || typeof message.data !== 'object' || Array.isArray(message.data)) return false;
  const room = message.data as { name?: unknown; chatMess?: unknown };
  return typeof room.name === 'string' && room.name.toLowerCase() === name.toLowerCase() && Array.isArray(room.chatMess);
}

export function requestChatHistory(name: string, page: number, kind: HistoryKind, timeoutMs = 10_000): Promise<WebSocketMessage> {
  const run = queue.catch(() => undefined).then(async () => {
    await ensureLoginConnection();
    return new Promise<WebSocketMessage>((resolve, reject) => {
      const socket = websocketService.getSocket();
      let settled = false;
      let offMain = () => {};
      let offError = () => {};
      let offStatus = () => {};
      const finish = (error?: Error, frame?: WebSocketMessage) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        offMain(); offError(); offStatus();
        if (error) reject(error); else if (frame) resolve(frame);
      };
      const receive = (frame: WebSocketMessage) => {
        if (websocketService.getSocket() !== socket) {
          finish(new Error('Phiên WebSocket đã thay đổi.'));
          return;
        }
        if (historyResponseMatches(frame, kind, name)) finish(undefined, frame);
      };
      const timer = setTimeout(() => finish(new Error('Máy chủ chưa phản hồi lịch sử tin nhắn.')), timeoutMs);
      offMain = websocketService.on(HISTORY_EVENT, receive);
      offError = websocketService.on(ROOM_ERROR_EVENT, receive);
      offStatus = websocketService.onStatus(status => {
        if (status === 'ERROR' || status === 'DISCONNECTED') finish(new Error('Mất kết nối khi tải lịch sử.'));
      });
      try { websocketService.send(HISTORY_EVENT, { name, page }); }
      catch (error) { finish(error instanceof Error ? error : new Error('Không gửi được yêu cầu lịch sử.')); }
    });
  });
  queue = run.then(() => undefined, () => undefined);
  return run;
}
