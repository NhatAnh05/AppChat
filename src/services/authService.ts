/** API đầu tiên: REGISTER. Chưa triển khai LOGIN / RE_LOGIN / LOGOUT thật. */
import { makeRegisterRequest, readRegisterResponse, type RegisterResponse } from './registerProtocol';

const FALLBACK_WS_URL = 'wss://chat.longapp.io.vn/chat/chat';
const WS_URL = import.meta.env.VITE_CHAT_WS_URL?.trim() || FALLBACK_WS_URL;

export interface RegisterAccountInput {
  username: string;
  password: string;
}

/**
 * Mở một WebSocket ngắn hạn cho REGISTER và đóng sau khi có kết quả.
 * Không lưu mật khẩu ở localStorage/sessionStorage, không ghi request ra console.
 */
export function registerAccount(
    input: RegisterAccountInput,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<RegisterResponse> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL);
    const timeoutMs = options.timeoutMs ?? 12000;
    let finished = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onAbort);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };

    const finish = (result: { response: RegisterResponse } | { error: Error }) => {
      if (finished) return;
      finished = true;
      cleanup();
      if ('error' in result) reject(result.error);
      else resolve(result.response);
    };

    function onAbort() {
      finish({ error: new Error('Đã hủy yêu cầu đăng ký.') });
    }

    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }

    timeoutId = setTimeout(() => {
      finish({ error: new Error('Máy chủ không phản hồi sau 12 giây. Vui lòng thử lại.') });
    }, timeoutMs);

    socket.onopen = () => {
      try {
        socket.send(JSON.stringify(makeRegisterRequest(input.username, input.password)));
      } catch {
        finish({ error: new Error('Không thể gửi yêu cầu đăng ký tới máy chủ.') });
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      const response = readRegisterResponse(event.data);
      if (!response) return;
      if (response.status === 'success') {
        finish({ response });
      } else {
        finish({ error: new Error(response.mes || 'Đăng ký không thành công.') });
      }
    };

    socket.onerror = () => {
      finish({ error: new Error('Không thể kết nối tới máy chủ WebSocket. Kiểm tra mạng hoặc liên hệ bên cung cấp API.') });
    };
    socket.onclose = () => {
      finish({ error: new Error('Máy chủ đóng kết nối trước khi trả kết quả đăng ký.') });
    };
  });
}
