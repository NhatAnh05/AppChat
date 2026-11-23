import { CHAT_WS_URL, websocketService } from './websocket.ts';
import { getConnectionState, setConnectionState } from './connectionHealth.ts';
import { clearLoginSession, readLoginSession, saveLoginSession, type SavedLoginSession } from './sessionStore.ts';
import { reLoginOnce, ReLoginRejectedError } from './reLoginService.ts';

const LOGIN_TIMEOUT = 12000;
const RETRY_DELAY_START_MS = 20_000;
const RETRY_DELAY_MAX_MS = 120_000;
let activeSocket: WebSocket | null = null;
let pendingRecovery: Promise<SavedLoginSession | null> | null = null;
let recoveryAbort: AbortController | null = null;
let generation = 0;
let signingOut = false;
let recoveryRetryTimer: ReturnType<typeof setTimeout> | null = null;
let nextRetryDelayMs = RETRY_DELAY_START_MS;

function cancelScheduledRetry(): void {
  if (recoveryRetryTimer !== null) clearTimeout(recoveryRetryTimer);
  recoveryRetryTimer = null;
}

/** Three failed handshakes pause retries, but NEVER discard a valid saved session. */
function scheduleRecoveryRetry(token: number): void {
  if (recoveryRetryTimer !== null || signingOut || token !== generation || !readLoginSession()) return;
  const delay = nextRetryDelayMs;
  nextRetryDelayMs = Math.min(delay * 2, RETRY_DELAY_MAX_MS);
  recoveryRetryTimer = setTimeout(() => {
    recoveryRetryTimer = null;
    if (!signingOut && token === generation && !getAuthenticatedSocket()) {
      void restoreLoginSession();
    }
  }, delay);
}

/** Reconnect promptly after returning to the tab or regaining network access. */
function retryWhenAvailable(): void {
  if (signingOut || getConnectionState() !== 'offline' || !readLoginSession()) return;
  cancelScheduledRetry();
  void restoreLoginSession();
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', retryWhenAvailable);
  window.addEventListener('focus', retryWhenAvailable);
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retryWhenAvailable();
  });
}

export function getAuthenticatedSocket(): WebSocket | null {
  return !signingOut && activeSocket?.readyState === WebSocket.OPEN ? activeSocket : null;
}

function activate(socket: WebSocket, session: SavedLoginSession, token: number): void {
  if (token !== generation || signingOut) { socket.close(); return; }
  activeSocket = socket;
  cancelScheduledRetry();
  nextRetryDelayMs = RETRY_DELAY_START_MS;
  saveLoginSession(session);
  const oldClose = socket.onclose;
  socket.onclose = event => {
    oldClose?.call(socket, event);
    if (activeSocket !== socket) return;
    activeSocket = null;
    websocketService.release(socket);
    if (!signingOut && token === generation && readLoginSession()) {
      void restoreLoginSession();
    }
  };
  websocketService.adopt(socket, true);
  setConnectionState('connected');
}

/** API 2: brand-new socket; never reuse unauthenticated REGISTER connection. */
export function loginAccount({username, password}: {username: string; password: string}): Promise<SavedLoginSession> {
  const user = username.trim();
  if (!user || !password) return Promise.reject(new Error('Thiếu tài khoản hoặc mật khẩu.'));
  disconnectLoginSession();
  signingOut = false;
  const token = generation;
  setConnectionState('reconnecting');
  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try { socket = new WebSocket(CHAT_WS_URL); }
    catch { reject(new Error('Không mở được WebSocket.')); return; }
    let finished = false;
    const finish = (error?: Error, session?: SavedLoginSession) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (error) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        socket.close();
        if (token === generation) setConnectionState('signed-out');
        reject(error);
      } else if (session) {
        // Stop the handshake listener before attaching the shared transport.
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        if (token !== generation || signingOut) { socket.close(); reject(new Error('Đã hủy đăng nhập.')); return; }
        activate(socket, session, token);
        resolve(session);
      }
    };
    const timeout = setTimeout(() => finish(new Error('Máy chủ không phản hồi LOGIN.')), LOGIN_TIMEOUT);
    socket.onopen = () => {
      if (token !== generation) { finish(new Error('Đã hủy đăng nhập.')); return; }
      socket.send(JSON.stringify({action:'onchat',data:{event:'LOGIN',data:{user,pass:password}}}));
    };
    socket.onmessage = message => {
      if (typeof message.data !== 'string') return;
      let value: unknown;
      try { value = JSON.parse(message.data); } catch { return; }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const frame = value as Record<string, unknown>;
      if (frame.event !== 'LOGIN') return;
      if (frame.status !== 'success') {
        finish(new Error(typeof frame.mes === 'string' ? frame.mes : 'Sai tài khoản hoặc mật khẩu.'));
        return;
      }
      const data = frame.data && typeof frame.data === 'object' ? frame.data as Record<string, unknown> : {};
      const code = data.RE_LOGIN_CODE;
      if (typeof code !== 'string' || !code.trim()) {
        finish(new Error('LOGIN thành công nhưng máy chủ thiếu RE_LOGIN_CODE.')); return;
      }
      finish(undefined, {username:user,reLoginCode:code});
    };
    socket.onerror = () => finish(new Error('Kết nối WebSocket bị lỗi khi đăng nhập.'));
    socket.onclose = () => finish(new Error('WebSocket đóng trước khi LOGIN thành công.'));
  });
}

/** API 3: F5/reconnect, rotate the server-provided code. Up to three network attempts. */
export function restoreLoginSession(): Promise<SavedLoginSession | null> {
  if (signingOut) return Promise.resolve(null);
  if (getAuthenticatedSocket()) return Promise.resolve(readLoginSession());
  if (pendingRecovery) return pendingRecovery;
  const session = readLoginSession();
  if (!session) { setConnectionState('signed-out'); return Promise.resolve(null); }
  cancelScheduledRetry();
  const token = generation;
  const controller = new AbortController();
  recoveryAbort = controller;
  setConnectionState('reconnecting');
  const work = (async () => {
    let backendRejectedSession = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (controller.signal.aborted || token !== generation) return null;
      try {
        const result = await reLoginOnce(CHAT_WS_URL, readLoginSession() ?? session, {
          signal: controller.signal, timeoutMs: LOGIN_TIMEOUT,
        });
        if (controller.signal.aborted || token !== generation || signingOut) { result.socket.close(); return null; }
        activate(result.socket, result.session, token);
        return result.session;
      } catch (error) {
        if (controller.signal.aborted || token !== generation) return null;
        if (error instanceof ReLoginRejectedError) {
          backendRejectedSession = true;
          break;
        }
        if (attempt < 2) await new Promise<void>(resolve => {
          const timer = setTimeout(() => {controller.signal.removeEventListener('abort', onAbort); resolve();}, 1000);
          const onAbort = () => {clearTimeout(timer); resolve();};
          controller.signal.addEventListener('abort', onAbort, {once:true});
        });
      }
    }
    if (token === generation && !signingOut) {
      if (backendRejectedSession || !readLoginSession()) {
        // Explicit server rejection or expired local credentials: sign out.
        cancelScheduledRetry();
        clearLoginSession();
        setConnectionState('signed-out');
      } else {
        // Network failure/timeouts are NOT a logout. Preserve the session and
        // retry later, with capped backoff to avoid a busy reconnect loop.
        setConnectionState('offline');
        scheduleRecoveryRetry(token);
      }
    }
    return null;
  })();
  pendingRecovery = work;
  void work.finally(() => {
    if (pendingRecovery === work) pendingRecovery = null;
    if (recoveryAbort === controller) recoveryAbort = null;
  });
  return work;
}

export async function ensureLoginConnection(): Promise<void> {
  if (getAuthenticatedSocket()) return;
  if (getConnectionState() === 'signing-out' || signingOut) throw new Error('Đang đăng xuất.');
  const result = await restoreLoginSession();
  if (!result || !getAuthenticatedSocket()) {
    if (getConnectionState() === 'offline' || getConnectionState() === 'reconnecting') {
      throw new Error('Tạm mất kết nối máy chủ. Phiên đăng nhập được giữ lại và ứng dụng sẽ tự thử kết nối lại.');
    }
    throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
  }
}

/** Freeze reconnect immediately, but preserve session until ACK is received. */
export function beginLogoutSession(): WebSocket | null {
  signingOut = true;
  generation++;
  cancelScheduledRetry();
  recoveryAbort?.abort();
  const current = getAuthenticatedSocketUnsafe();
  activeSocket = null;
  setConnectionState('signing-out');
  websocketService.lockAuthenticatedOperations();
  return current;
}
function getAuthenticatedSocketUnsafe(): WebSocket | null {
  return activeSocket?.readyState === WebSocket.OPEN ? activeSocket : null;
}
export function disconnectLoginSession(): void {
  signingOut = true;
  generation++;
  cancelScheduledRetry();
  nextRetryDelayMs = RETRY_DELAY_START_MS;
  recoveryAbort?.abort();
  const old = activeSocket;
  activeSocket = null;
  clearLoginSession();
  websocketService.disconnect();
  if (old && old.readyState === WebSocket.OPEN) old.close();
  setConnectionState('signed-out');
  signingOut = false;
}
