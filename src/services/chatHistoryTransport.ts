/**
 * Room history request uses CHAT_PEOPLE_GET_MES; its room-error response
 * may instead use GET_ROOM_CHAT_MES, as specified by API row 11.
 * Personal-chat history retains its separately verified compatibility behavior.
 * Responses have no request ID, so both history types share one queue.
 */
import { ensureLoginConnection } from './loginService.ts';
import { websocketService, type WebSocketMessage } from './websocket.ts';
import { CHAT_HISTORY_EVENT, ROOM_HISTORY_EVENT } from './chatApiEvents.ts';
import { withApiProbeGate } from './apiProbeGate.ts';

export const HISTORY_EVENT = CHAT_HISTORY_EVENT;
const ROOM_EVENT = ROOM_HISTORY_EVENT;
type HistoryKind = 'people' | 'room';
let queue: Promise<void> = Promise.resolve();
const ALTERNATES: Record<HistoryKind, string> = {
  people: 'GET_PEOPLE_CHAT_MES',
  room: CHAT_HISTORY_EVENT,
};
let currentSocket: WebSocket | null = null;
const unsupported = new Set<HistoryKind>();
const preferredEvent = new Map<HistoryKind, string>();

function currentCapabilities() {
  const socket = websocketService.getSocket();
  if (socket !== currentSocket) {
    currentSocket = socket;
    unsupported.clear();
    preferredEvent.clear();
  }
}

/** Cấm tự động polling khi cả sự kiện mới và cũ đều bị server từ chối. */
export function isHistoryUnsupported(kind: HistoryKind): boolean {
  currentCapabilities();
  return unsupported.has(kind);
}
export function resetHistoryCompatibility(): void {
  currentSocket = null;
  unsupported.clear();
  preferredEvent.clear();
}

export function historyEventCandidates(kind: HistoryKind): string[] {
  // Request the Excel event first for both kinds of chat history.
  // Use the older alias only if the server explicitly rejects the event.
  const first = preferredEvent.get(kind) ?? ALTERNATES[kind];
  // The documented room request must be CHAT_PEOPLE_GET_MES.
  // GET_ROOM_CHAT_MES is a documented room ERROR response, not a request.
  if (kind === 'room') return [HISTORY_EVENT];
  return [...new Set([first, HISTORY_EVENT, ALTERNATES[kind]])];
}


export function historyResponseMatches(message: WebSocketMessage, kind: HistoryKind, name: string): boolean {
  if (message.event === ROOM_EVENT) return kind === 'room' && message.status === 'error';
  if (message.event !== HISTORY_EVENT && message.event !== ALTERNATES[kind]) return false;
  if (message.status === 'error') return true; // shared event; queue guarantees one outstanding request
  if (kind === 'people') return Array.isArray(message.data);
  if (!message.data || typeof message.data !== 'object' || Array.isArray(message.data)) return false;
  const room = message.data as { name?: unknown; chatMess?: unknown };
  return typeof room.name === 'string' && room.name.toLowerCase() === name.toLowerCase() && Array.isArray(room.chatMess);
}

export function requestChatHistory(name: string, page: number, kind: HistoryKind, timeoutMs = 10_000, signal?: AbortSignal): Promise<WebSocketMessage> {
  if (!name.trim() || !Number.isInteger(page) || page < 1) return Promise.reject(new Error('Yêu cầu lịch sử không hợp lệ.'));
  if (signal?.aborted) return Promise.reject(new Error('Đã hủy tải lịch sử.'));
  const run = queue.catch(() => undefined).then(() => withApiProbeGate(async () => {
    if (signal?.aborted) throw new Error('Đã hủy tải lịch sử.');
    await ensureLoginConnection();
    if (signal?.aborted) throw new Error('Đã hủy tải lịch sử.');
    currentCapabilities();
    if (unsupported.has(kind)) throw new Error('Máy chủ đang từ chối API lịch sử trò chuyện này (ACTION_NOT_EXIT). Không thử lại cho đến khi kết nối WebSocket thay đổi.');
    const candidates = historyEventCandidates(kind);
    for (const event of candidates) {
      try {
        const frame = await new Promise<WebSocketMessage>((resolve, reject) => {
          const socket = websocketService.getSocket();
          let settled = false;
          const cleanups: Array<() => void> = [];
          const finish = (error?: Error, response?: WebSocketMessage) => {
            if (settled) return;
            settled = true;
            cleanups.forEach(cleanup => cleanup());
            if (error) reject(error);
            else if (response) resolve(response);
          };
          const receive = (response: WebSocketMessage) => {
            if (websocketService.getSocket() !== socket) {
              finish(new Error('Phiên WebSocket đã thay đổi.'));
              return;
            }
            if (historyResponseMatches(response, kind, name)) finish(undefined, response);
          };
          cleanups.push(websocketService.on(HISTORY_EVENT, receive));
          cleanups.push(websocketService.on(ALTERNATES[kind], receive));
          // Room errors use GET_ROOM_CHAT_MES despite the CHAT_PEOPLE_GET_MES request.
          if (kind === 'room') cleanups.push(websocketService.on(ROOM_EVENT, receive));
          cleanups.push(websocketService.on('ACTION_NOT_EXIT', () => finish(new Error('ACTION_NOT_EXIT'))));
          cleanups.push(websocketService.onStatus(status => {
            if (status === 'ERROR' || status === 'DISCONNECTED') finish(new Error('Mất kết nối khi tải lịch sử.'));
          }));
          const onAbort = () => finish(new Error('Đã hủy tải lịch sử.'));
          signal?.addEventListener('abort', onAbort, { once:true });
          cleanups.push(() => signal?.removeEventListener('abort', onAbort));
          const timer = setTimeout(() => finish(new Error('Máy chủ chưa phản hồi lịch sử tin nhắn.')), timeoutMs);
          cleanups.push(() => clearTimeout(timer));
          if (signal?.aborted) { onAbort(); return; }
          try { websocketService.send(event, { name, page }); }
          catch (error) { finish(error instanceof Error ? error : new Error('Không gửi được yêu cầu lịch sử.')); }
        });
        preferredEvent.set(kind, event);
        return frame;
      } catch (error) {
        // Chỉ thử phiên bản event khác khi server CHỦ ĐỘNG báo không có event.
        // Timeout hoặc lỗi kết nối không được dùng để thử bừa, tránh gửi lặp.
        if (!(error instanceof Error) || error.message !== 'ACTION_NOT_EXIT') throw error;
      }
    }
    unsupported.add(kind);
    throw new Error('Máy chủ từ chối API lịch sử (ACTION_NOT_EXIT). Đã ngừng gửi yêu cầu trên kết nối này để tránh lặp lỗi.');
  }));
  queue = run.then(() => undefined, () => undefined);
  return run;
}
