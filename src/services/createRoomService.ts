import { ensureLoginConnection } from './loginService.ts';
import { normalizeRoomName, parseCreateRoomResponse, type CreatedRoom } from './createRoomProtocol.ts';
import { websocketService } from './websocket.ts';

type CreateRoomOptions = { timeoutMs?: number; signal?: AbortSignal };
const DEFAULT_TIMEOUT_MS = 10000;

// The teacher's CREATE_ROOM response has no request ID. Serialize requests to
// prevent a response for one name being mistaken for another pending create.
let pending: { name: string; promise: Promise<CreatedRoom> } | null = null;

async function sendCreateRoom(name: string, options: CreateRoomOptions): Promise<CreatedRoom> {
  if (options.signal?.aborted) throw new Error('Đã hủy tạo nhóm.');
  await ensureLoginConnection();
  if (options.signal?.aborted) throw new Error('Đã hủy tạo nhóm.');
  const socket = websocketService.getSocket();
  if (!socket || !websocketService.isAuthenticated()) throw new Error('Vui lòng đăng nhập trước khi tạo nhóm.');

  return new Promise<CreatedRoom>((resolve, reject) => {
    let finished = false;
    const cleanup = () => {
      clearTimeout(timer);
      offMessage();
      offStatus();
      options.signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error?: Error, room?: CreatedRoom) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else if (room) resolve(room);
    };
    const onAbort = () => finish(new Error('Đã hủy tạo nhóm.'));
    const offMessage = websocketService.on('CREATE_ROOM', (frame) => {
      if (websocketService.getSocket() !== socket || !websocketService.isAuthenticated()) {
        finish(new Error('Phiên WebSocket đã thay đổi.'));
        return;
      }
      const result = parseCreateRoomResponse(frame);
      if (!result) return;
      if (result.status === 'error') { finish(new Error(result.message)); return; }
      // No request ID: ignore an unrelated room success (e.g. delayed broadcast).
      if (result.room.name.toLocaleLowerCase() !== name.toLocaleLowerCase()) return;
      finish(undefined, result.room);
    });
    const offStatus = websocketService.onStatus(status => {
      if (status === 'DISCONNECTED' || status === 'ERROR') finish(new Error('Mất kết nối khi tạo nhóm.'));
    });
    const timer = setTimeout(() => finish(new Error('Máy chủ không phản hồi CREATE_ROOM.')),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    options.signal?.addEventListener('abort', onAbort, {once: true});
    if (options.signal?.aborted) { onAbort(); return; }
    try { websocketService.send('CREATE_ROOM', { name }); }
    catch (error) { finish(error instanceof Error ? error : new Error('Không gửi được CREATE_ROOM.')); }
  });
}

export function createRoom(rawName: string, options: CreateRoomOptions = {}): Promise<CreatedRoom> {
  let name: string;
  try { name = normalizeRoomName(rawName); }
  catch (error) { return Promise.reject(error); }
  if (pending) {
    return pending.name === name
      ? pending.promise
      : Promise.reject(new Error('Đang tạo một nhóm khác, vui lòng hoàn tất yêu cầu hiện tại.'));
  }
  const task = sendCreateRoom(name, options);
  pending = {name, promise:task};
  void task.then(() => { if (pending?.promise === task) pending = null; },
    () => { if (pending?.promise === task) pending = null; });
  return task;
}
