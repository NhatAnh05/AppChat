import { makeLoginRequest, readLoginResponse } from './loginProtocol';

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

/** Giữ WebSocket đã đăng nhập cho API về sau. Không dùng socket REGISTER ngắn hạn. */
export function getAuthenticatedSocket(): WebSocket | null {
  if (authenticatedSocket?.readyState !== WebSocket.OPEN) return null;
  return authenticatedSocket;
}

/** API #4 LOGOUT chưa triển khai: chỉ đóng socket và xóa trạng thái client. */
export function disconnectLoginSession(): void {
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
      socket.onclose = () => {
        if (authenticatedSocket === socket) {
          authenticatedSocket = null;
          options.onDisconnected?.();
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
