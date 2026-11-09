/** LOGIN (#2) and RE_LOGIN (#3) share one authenticated WebSocket. */
import { makeLoginRequest, readLoginResponse } from './loginProtocol.ts';
import { getConnectionState, setConnectionState } from './connectionHealth.ts';
import { reLoginOnce, ReLoginRejectedError } from './reLoginService.ts';
import { clearLoginSession, readLoginSession, saveLoginSession, type SavedLoginSession } from './sessionStore.ts';

const FALLBACK_WS_URL = 'wss://chat.longapp.io.vn/chat/chat';
const WS_URL = import.meta.env?.VITE_CHAT_WS_URL?.trim() || FALLBACK_WS_URL;
const MAX_RELOGIN_ATTEMPTS = 3;

export interface LoginAccountInput { username: string; password: string }
export interface LoginSession extends SavedLoginSession {}

let authenticatedSocket: WebSocket | null = null;
let lastSession: LoginSession | null = null;
let manualLogout = false;
let authVersion = 0;
let recoveryPromise: Promise<LoginSession | null> | null = null;
let recoveryAbort: AbortController | null = null;
let disconnectCallback: (() => void) | undefined;

export function getAuthenticatedSocket(): WebSocket | null {
  return authenticatedSocket?.readyState === WebSocket.OPEN ? authenticatedSocket : null;
}

/** API #4 LOGOUT is out of scope here: clear client-side session and close socket. */
export function disconnectLoginSession(): void {
  authVersion++;
  manualLogout = true;
  recoveryAbort?.abort();
  recoveryAbort = null;
  recoveryPromise = null;
  disconnectCallback = undefined;
  clearLoginSession();
  lastSession = null;
  setConnectionState('signed-out');
  const current = authenticatedSocket;
  authenticatedSocket = null;
  if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) current.close();
}

function invalidateSession(): void {
  // Invalid backend session or exhausted retries: no silent fallback into chat.
  if (manualLogout) return;
  const callback = disconnectCallback;
  disconnectLoginSession();
  callback?.();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('lyra:auth-expired'));
}

function bindAuthenticatedSocket(socket: WebSocket): void {
  authenticatedSocket = socket;
  socket.onclose = () => {
    if (authenticatedSocket !== socket || manualLogout) return;
    authenticatedSocket = null;
    setConnectionState('offline');
    void restoreLoginSession();
  };
  socket.onerror = () => {
    if (authenticatedSocket === socket) setConnectionState('offline');
    // Browsers normally deliver onclose after onerror; never open two sockets here.
  };
}

export function loginAccount(
    input: LoginAccountInput,
    options: { signal?: AbortSignal; timeoutMs?: number; onDisconnected?: () => void } = {},
): Promise<LoginSession> {
  disconnectLoginSession();
  manualLogout = false;
  disconnectCallback = options.onDisconnected;
  const version = authVersion;
  setConnectionState('reconnecting');

  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error('Đã hủy yêu cầu đăng nhập.')); return; }
    let socket: WebSocket;
    try { socket = new WebSocket(WS_URL); }
    catch { setConnectionState('signed-out'); reject(new Error('Không thể tạo kết nối WebSocket.')); return; }
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
    const fail = (reason: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
      if (authVersion === version) setConnectionState('signed-out');
      reject(reason);
    };
    function onAbort() { fail(new Error('Đã hủy yêu cầu đăng nhập.')); }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) { onAbort(); return; }
    timeoutId = setTimeout(() => fail(new Error('Máy chủ không phản hồi LOGIN. Vui lòng thử lại.')), options.timeoutMs ?? 12000);
    socket.onopen = () => {
      try { socket.send(JSON.stringify(makeLoginRequest(input.username, input.password))); }
      catch { fail(new Error('Không thể gửi yêu cầu LOGIN đến máy chủ.')); }
    };
    socket.onmessage = event => {
      if (typeof event.data !== 'string') return;
      const response = readLoginResponse(event.data);
      if (!response) return;
      if (response.status === 'error') { fail(new Error(response.mes)); return; }
      const code = response.data?.RE_LOGIN_CODE;
      if (!code) { fail(new Error('Máy chủ trả LOGIN thành công nhưng thiếu RE_LOGIN_CODE.')); return; }
      if (version !== authVersion || manualLogout) { fail(new Error('Phiên đăng nhập đã bị hủy.')); return; }
      settled = true;
      cleanup();
      lastSession = { username: input.username, reLoginCode: code };
      saveLoginSession(lastSession);
      bindAuthenticatedSocket(socket);
      setConnectionState('connected');
      resolve(lastSession);
    };
    socket.onerror = () => fail(new Error('Không thể kết nối tới máy chủ WebSocket. Kiểm tra mạng và địa chỉ WSS.'));
    socket.onclose = () => fail(new Error('Máy chủ đóng kết nối trước khi xác nhận đăng nhập.'));
  });
}

/** Cancellable delay between retries. No infinite reconnect loop. */
function retryDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Aborted')); return; }
    const finish = () => { signal.removeEventListener('abort', onAbort); resolve(); };
    const timer = setTimeout(finish, ms);
    const onAbort = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(new Error('Aborted')); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Restores a cached session on F5 OR recovers a dropped authenticated socket.
 * The server remains authoritative: never show chat before RE_LOGIN: success.
 */
export function restoreLoginSession(options: { onDisconnected?: () => void } = {}): Promise<LoginSession | null> {
  if (options.onDisconnected) disconnectCallback = options.onDisconnected;
  if (getAuthenticatedSocket() && lastSession) return Promise.resolve(lastSession);
  if (recoveryPromise) return recoveryPromise;
  if (manualLogout && !readLoginSession()) return Promise.resolve(null);
  const initial = lastSession ?? readLoginSession();
  if (!initial) { setConnectionState('signed-out'); return Promise.resolve(null); }
  manualLogout = false;
  lastSession = initial;
  const version = authVersion;
  const abortController = new AbortController();
  recoveryAbort = abortController;
  setConnectionState('reconnecting');

  const task = (async (): Promise<LoginSession | null> => {
    for (let attempt = 1; attempt <= MAX_RELOGIN_ATTEMPTS; attempt++) {
      if (version !== authVersion || abortController.signal.aborted) return null;
      try {
        const result = await reLoginOnce(WS_URL, lastSession!, { signal: abortController.signal });
        if (version !== authVersion || abortController.signal.aborted) {
          result.socket.close();
          return null;
        }
        lastSession = result.session;
        saveLoginSession(result.session); // rotate: NEVER retain previous RE_LOGIN_CODE
        bindAuthenticatedSocket(result.socket);
        setConnectionState('connected');
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('lyra:reconnected'));
        return result.session;
      } catch (reason) {
        if (version !== authVersion || abortController.signal.aborted) return null;
        if (reason instanceof ReLoginRejectedError) break; // Expired / invalid / no new code.
        if (attempt < MAX_RELOGIN_ATTEMPTS) {
          setConnectionState('offline');
          try { await retryDelay(1000 * 2 ** (attempt - 1), abortController.signal); }
          catch { return null; }
          setConnectionState('reconnecting');
        }
      }
    }
    if (version === authVersion && !abortController.signal.aborted) invalidateSession();
    return null;
  })();
  const pending = task.finally(() => {
    if (recoveryPromise === pending) recoveryPromise = null;
    if (recoveryAbort === abortController) recoveryAbort = null;
  });
  recoveryPromise = pending;
  return pending;
}

/** Retry button; only works while disconnected, never opens parallel sockets. */
export function retryConnectionNow(onDisconnected?: () => void): void {
  if (getConnectionState() === 'connected' || recoveryPromise) return;
  void restoreLoginSession({ onDisconnected });
}
