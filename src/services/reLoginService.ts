import { makeReLoginRequest, readReLoginResponse } from './reLoginProtocol.ts';
import type { SavedLoginSession } from './sessionStore.ts';

/** Máy chủ RE_LOGIN từ chối mã; không được retry mã này như lỗi mạng tạm thời. */
export class ReLoginRejectedError extends Error {
  constructor(message: string) { super(message); this.name = 'ReLoginRejectedError'; }
}

/** Opens a NEW socket; returns it only AFTER RE_LOGIN is accepted by server. */
export function reLoginOnce(
  url: string,
  session: SavedLoginSession,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ socket: WebSocket; session: SavedLoginSession }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error('Đã hủy khôi phục phiên.')); return; }
    let socket: WebSocket;
    try { socket = new WebSocket(url); }
    catch { reject(new Error('Không thể tạo kết nối WebSocket.')); return; }
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onAbort);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
      reject(error);
    };
    function onAbort() { fail(new Error('Đã hủy khôi phục phiên.')); }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) { onAbort(); return; }
    timeoutId = setTimeout(() => fail(new Error('Máy chủ không phản hồi RE_LOGIN.')), options.timeoutMs ?? 12000);

    socket.onopen = () => {
      try { socket.send(JSON.stringify(makeReLoginRequest(session.username, session.reLoginCode))); }
      catch { fail(new Error('Không gửi được yêu cầu RE_LOGIN.')); }
    };
    socket.onmessage = event => {
      if (typeof event.data !== 'string') return;
      const response = readReLoginResponse(event.data);
      if (!response) return;
      if (response.status === 'error') { fail(new ReLoginRejectedError(response.mes)); return; }
      const code = response.data?.RE_LOGIN_CODE;
      if (!code) { fail(new ReLoginRejectedError('Máy chủ xác nhận RE_LOGIN nhưng thiếu mã phiên mới.')); return; }
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ socket, session: { username: session.username, reLoginCode: code } });
    };
    socket.onerror = () => fail(new Error('Không thể kết nối đến máy chủ WebSocket.'));
    socket.onclose = () => fail(new Error('Kết nối đóng trước khi RE_LOGIN được xác nhận.'));
  });
}
