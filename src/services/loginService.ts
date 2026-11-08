import { makeLoginRequest, readLoginResponse } from './loginProtocol';
import { getConnectionState, setConnectionState } from './connectionHealth';

const FALLBACK_WS_URL = 'wss://chat.longapp.io.vn/chat/chat';
const WS_URL = import.meta.env.VITE_CHAT_WS_URL?.trim() || FALLBACK_WS_URL;

export interface LoginAccountInput {
  username: string;
  password: string;
}

export interface LoginSession {
  username: string;
  /** Mã phiên của Backend, chỉ giữ trong bộ nhớ. API RE_LOGIN sẽ dùng ở giai đoạn sau. */
  reLoginCode: string;
}

let authenticatedSocket: WebSocket | null = null;
let manualLogout = false;
let reconnecting = false;
let lastSession: LoginSession | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;


/** Giữ WebSocket đã đăng nhập cho API về sau. Không dùng socket REGISTER ngắn hạn. */
export function getAuthenticatedSocket(): WebSocket | null {
  if (authenticatedSocket?.readyState !== WebSocket.OPEN) return null;
  return authenticatedSocket;
}

/** API #4 LOGOUT chưa triển khai: chỉ đóng socket và xóa trạng thái client. */
export function disconnectLoginSession(): void {
  manualLogout = true;
  setConnectionState('signed-out');
  lastSession = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const previous = authenticatedSocket;
  authenticatedSocket = null;
  if (previous && (previous.readyState === WebSocket.OPEN || previous.readyState === WebSocket.CONNECTING)) {
    previous.close();
  }
}

export function loginAccount(
  input: LoginAccountInput,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    onDisconnected?: () => void;
  } = {},
): Promise<LoginSession> {
  disconnectLoginSession();
  manualLogout = false;
  setConnectionState('reconnecting');

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL);
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanupPending = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onAbort);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      setConnectionState('signed-out');
      cleanupPending();
      socket.onclose = null;
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
      reject(error);
    };

    function onAbort() {
      fail(new Error('Đã hủy yêu cầu đăng nhập.'));
    }

    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }

    timeoutId = setTimeout(() => {
      fail(new Error('Máy chủ không phản hồi LOGIN. Vui lòng thử lại.'));
    }, options.timeoutMs ?? 12000);

    socket.onopen = () => {
      try {
        socket.send(JSON.stringify(makeLoginRequest(input.username, input.password)));
      } catch {
        fail(new Error('Không thể gửi yêu cầu LOGIN đến máy chủ.'));
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      const response = readLoginResponse(event.data);
      if (!response) return;

      if (response.status === 'error') {
        fail(new Error(response.mes || 'Tên tài khoản hoặc mật khẩu không đúng.'));
        return;
      }
      const code = response.data?.RE_LOGIN_CODE;
      if (!code) {
        fail(new Error('Máy chủ trả LOGIN thành công nhưng thiếu RE_LOGIN_CODE.'));
        return;
      }

      settled = true;
      cleanupPending();
      authenticatedSocket = socket;
      setConnectionState('connected');
      lastSession = { username: input.username, reLoginCode: code };
      socket.onclose = () => {
        if (authenticatedSocket === socket) {
          authenticatedSocket = null;
          if (!manualLogout) { setConnectionState('offline'); void reconnectSession(1, options.onDisconnected); }
        }
      };
      resolve({ username: input.username, reLoginCode: code });
    };

    socket.onerror = () => {
      fail(new Error('Không thể kết nối tới máy chủ WebSocket. Kiểm tra mạng và địa chỉ WSS.'));
    };
    socket.onclose = () => {
      fail(new Error('Máy chủ đóng kết nối trước khi xác nhận đăng nhập.'));
    };
  });
}

/** RE_LOGIN: backoff capped at 30 seconds. A transient network outage must not log the user out. */
async function reconnectSession(attempt: number, onDisconnected?: () => void): Promise<void> {
  if (manualLogout || !lastSession || reconnecting) return;
  reconnecting = true;
  setConnectionState('reconnecting');
  const session = lastSession;
  let invalidSession = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(WS_URL);
      let completed = false;
      const fail = (error: Error) => {
        if (completed) return;
        completed = true;
        clearTimeout(timeout);
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
        reject(error);
      };
      const timeout = setTimeout(() => fail(new Error('RE_LOGIN timed out')), 12000);
      socket.onopen = () => {
        try { socket.send(JSON.stringify({ action: 'onchat', data: { event: 'RE_LOGIN', data: { user: session.username, code: session.reLoginCode } } })); }
        catch { fail(new Error('Cannot send RE_LOGIN')); }
      };
      socket.onmessage = message => {
        if (typeof message.data !== 'string') return;
        try {
          const packet = JSON.parse(message.data);
          if (packet.event !== 'RE_LOGIN') return;
          if (packet.status !== 'success' || !packet.data?.RE_LOGIN_CODE) {
            invalidSession = packet.status === 'error' && /expired|invalid|not login|wrong|hết hạn/i.test(String(packet.mes || ''));
            fail(new Error('RE_LOGIN rejected')); return;
          }
          completed = true;
          clearTimeout(timeout);
          lastSession = { username: session.username, reLoginCode: String(packet.data.RE_LOGIN_CODE) };
          authenticatedSocket = socket;
          socket.onmessage = null;
          socket.onerror = null;
          socket.onclose = () => {
            if (authenticatedSocket === socket && !manualLogout) {
              authenticatedSocket = null;
              setConnectionState('offline');
              void reconnectSession(1, onDisconnected);
            }
          };
          setConnectionState('connected');
          window.dispatchEvent(new Event('lyra:reconnected'));
          resolve();
        } catch { fail(new Error('Malformed RE_LOGIN response')); }
      };
      socket.onerror = () => fail(new Error('Connection unavailable'));
      socket.onclose = () => fail(new Error('Connection closed'));
    });
  } catch {
    if (manualLogout || !lastSession) return;
    if (invalidSession) {
      lastSession = null;
      setConnectionState('signed-out');
      onDisconnected?.();
      return;
    }
    // Retry without forcing logout for temporary 521/network failures.
    setConnectionState('offline');
    const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
    reconnectTimer = setTimeout(() => { void reconnectSession(attempt + 1, onDisconnected); }, delay);
  } finally {
    reconnecting = false;
  }
}

/** Explicit retry from the UI. Does not create a second socket while reconnecting. */
export function retryConnectionNow(onDisconnected?: () => void): void {
  if (!lastSession || manualLogout || reconnecting || getConnectionState() === 'connected') return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  void reconnectSession(1, onDisconnected);
}
