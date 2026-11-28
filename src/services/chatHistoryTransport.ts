import { sessionQueue, assertCurrentSession, currentSessionSignal } from './sessionScope.ts';
/**
 * Excel rows 11/12 specify CHAT_PEOPLE_GET_MES for both histories.
 * Retry the room alias once after timeout on a fresh authenticated socket.
 * Responses have no request ID, so both history types share one queue.
 */
import { getAuthenticatedUsername } from './loginService.ts';
import { ensureCorrelatedConnection, quarantineResponse } from './requestCorrelation.ts';
import { preferExcelApi } from './apiCompatibility.ts';
import { sameChatUser } from './serverMessage.ts';
import { websocketService, type WebSocketMessage } from './websocket.ts';
import { CHAT_HISTORY_EVENT, ROOM_HISTORY_EVENT } from './chatApiEvents.ts';
import { withApiProbeGate } from './apiProbeGate.ts';

export const HISTORY_EVENT = CHAT_HISTORY_EVENT;
const ROOM_EVENT = ROOM_HISTORY_EVENT;
type HistoryKind = 'people' | 'room';
const queue = sessionQueue();
const ALTERNATES: Record<HistoryKind, string> = {
  people: 'GET_PEOPLE_CHAT_MES',
  room: ROOM_HISTORY_EVENT,
};
let currentSession: AbortSignal | null = null;
const cooldown = new Map<HistoryKind, number>();
class HistoryTimeoutError extends Error {}
const unsupported = new Set<HistoryKind>();
const preferredEvent = new Map<HistoryKind, string>();

function currentCapabilities() {
  const session = currentSessionSignal();
  if (session !== currentSession) {
    currentSession = session;
    cooldown.clear();
    unsupported.clear();
    preferredEvent.clear();
  }
}

/** Cấm tự động polling khi cả sự kiện mới và cũ đều bị server từ chối. */
export function isHistoryUnsupported(kind: HistoryKind): boolean {
  currentCapabilities();
  return unsupported.has(kind) || (cooldown.get(kind) ?? 0) > Date.now();
}
export function resetHistoryCompatibility(): void {
  currentSession = null;
  cooldown.clear();
  unsupported.clear();
  preferredEvent.clear();
}

export function historyEventCandidates(kind: HistoryKind, excel = preferExcelApi()): string[] {
  const first = preferredEvent.get(kind) ?? (excel ? HISTORY_EVENT : ALTERNATES[kind]);
  return [...new Set([first, HISTORY_EVENT, ALTERNATES[kind]])];
}


export function unwrapHistoryData(data: unknown): unknown {
  let value = data;
  // Unwrap only transport envelopes, never a named room or an actual page.
  for (let depth=0;depth<2;depth++) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) break;
    const record=value as Record<string,unknown>;
    if ('name' in record || 'chatMess' in record || !('data' in record)) break;
    value=record.data;
  }
  return value;
}
export function historyResponseMatches(message: WebSocketMessage, kind: HistoryKind, name: string, currentUser?: string): boolean {
  if (message.event === ROOM_EVENT && kind !== 'room') return false;
  if (message.event !== HISTORY_EVENT && message.event !== ALTERNATES[kind]) return false;
  const data = unwrapHistoryData(message.data);
  if (message.status === 'error') {
    // Some deployments include the queried name in errors. Never accept a
    // different named conversation; unnamed errors remain serialized.
    if(data && typeof data==='object' && !Array.isArray(data) && 'name' in data && typeof data.name==='string') return sameChatUser(data.name,name);
    return true;
  }
  if (kind === 'people') {
    if (!Array.isArray(data)) return false;
    if (!currentUser) return true; // standalone protocol inspection; runtime always passes identity
    return data.every(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
      const m = row as {name?:unknown;to?:unknown;type?:unknown};
      return (m.type === 0 || m.type === "0" || m.type === "people") && typeof m.name === 'string' && typeof m.to === 'string' &&
        ((sameChatUser(m.name,currentUser) && sameChatUser(m.to,name)) ||
         (sameChatUser(m.to,currentUser) && sameChatUser(m.name,name)));
    });
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const room = data as { name?: unknown; chatMess?: unknown };
  // A matching room with malformed data is delivered to the parser for an explicit error.
  return typeof room.name === 'string' && sameChatUser(room.name,name);
}

export function requestChatHistory(name: string, page: number, kind: HistoryKind, timeoutMs = 10_000, signal?: AbortSignal, fallbackOnTimeout = false): Promise<WebSocketMessage> {
  if (!name.trim() || !Number.isInteger(page) || page < 1) return Promise.reject(new Error('Yêu cầu lịch sử không hợp lệ.'));
  if (signal?.aborted) return Promise.reject(new Error('Đã hủy tải lịch sử.'));
  return queue(session => withApiProbeGate(async () => {
    assertCurrentSession(session);
    if (signal?.aborted) throw new Error('Đã hủy tải lịch sử.');
    await ensureCorrelatedConnection(session,'probe');
    const currentUser = getAuthenticatedUsername();
    if (!currentUser) throw new Error('Chưa xác thực phiên.');
    if (signal?.aborted) throw new Error('Đã hủy tải lịch sử.');
    currentCapabilities();
    if (unsupported.has(kind)) throw new Error('Máy chủ không hỗ trợ API lấy lịch sử cho loại cuộc trò chuyện này. Hãy kiểm tra phiên bản API.');
    const candidates = historyEventCandidates(kind);
    for (const [index,event] of candidates.entries()) {
      try {
        const frame = await new Promise<WebSocketMessage>((resolve, reject) => {
          assertCurrentSession(session);
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
            if (historyResponseMatches(response, kind, name, currentUser)) finish(undefined, {...response,data:unwrapHistoryData(response.data)});
          };
          cleanups.push(websocketService.on(HISTORY_EVENT, receive));
          cleanups.push(websocketService.on(ALTERNATES[kind], receive));
          cleanups.push(websocketService.on('ACTION_NOT_EXIT', () => finish(new Error('ACTION_NOT_EXIT'))));
          cleanups.push(websocketService.onStatus(status => {
            if (status === 'ERROR' || status === 'DISCONNECTED') {quarantineResponse(socket,'probe'); finish(new Error('Mất kết nối khi tải lịch sử.'));}
          }));
          let sent = false;
          const onAbort = () => { if (sent) quarantineResponse(socket,'probe'); finish(new Error('Đã hủy tải lịch sử.')); };
          signal?.addEventListener('abort', onAbort, { once:true });
          session.addEventListener('abort', onAbort, {once:true});
          cleanups.push(() => session.removeEventListener('abort', onAbort));
          cleanups.push(() => signal?.removeEventListener('abort', onAbort));
          const timer = setTimeout(() => { quarantineResponse(socket,'probe'); finish(new HistoryTimeoutError('Máy chủ chưa phản hồi lịch sử tin nhắn.')); }, timeoutMs);
          cleanups.push(() => clearTimeout(timer));
          if (signal?.aborted || session.aborted) { onAbort(); return; }
          try { sent = true; websocketService.send(event, { name, page }); }
          catch (error) { finish(error instanceof Error ? error : new Error('Không gửi được yêu cầu lịch sử.')); }
        });
        assertCurrentSession(session);
        preferredEvent.set(kind, event);
        cooldown.delete(kind);
        return frame;
      } catch (error) {
        // Retry a READ only, once, using the other documented/compatible event.
        // Never let an uncorrelated late reply from the old socket satisfy it.
        if (error instanceof HistoryTimeoutError) {
          cooldown.set(kind,Date.now()+120_000);
          if (kind==='room' && fallbackOnTimeout && index+1<candidates.length && !signal?.aborted) {
            await ensureCorrelatedConnection(session,'probe');
            if (signal?.aborted) throw new Error('Đã hủy tải lịch sử.', { cause: error });
            if (!sameChatUser(getAuthenticatedUsername()??'',currentUser)) throw new Error('Phiên xác thực đã thay đổi.', { cause: error });
            continue;
          }
          throw error;
        }
        if (!(error instanceof Error) || error.message !== 'ACTION_NOT_EXIT') throw error;
      }
    }
    unsupported.add(kind);
    throw new Error('Máy chủ trả ACTION_NOT_EXIT: cả API lịch sử mới và phiên bản cũ đều không được hỗ trợ. Đã dừng tự động tải lại để tránh spam WebSocket.');
  }));

}
