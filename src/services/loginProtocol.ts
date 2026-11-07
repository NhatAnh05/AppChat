/** API #2 LOGIN: chat_API.xlsx / 0Sheet1 / row 3. */
export interface LoginRequest {
  action: 'onchat';
  data: {
    event: 'LOGIN';
    data: { user: string; pass: string };
  };
}

export interface LoginResponse {
  event: 'LOGIN';
  status: 'success' | 'error';
  data?: { RE_LOGIN_CODE: string };
  mes?: string;
}

export function makeLoginRequest(username: string, password: string): LoginRequest {
  return {
    action: 'onchat',
    data: { event: 'LOGIN', data: { user: username, pass: password } },
  };
}

export function readLoginResponse(raw: string): LoginResponse | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const frame = value as Record<string, unknown>;
  if (frame.event !== 'LOGIN' || (frame.status !== 'success' && frame.status !== 'error')) return null;

  if (frame.status === 'error') {
    return {
      event: 'LOGIN',
      status: 'error',
      mes: typeof frame.mes === 'string' ? frame.mes : 'Đăng nhập không thành công.',
    };
  }

  // Response thành công nhưng thiếu RE_LOGIN_CODE vẫn được trả về để service báo lỗi rõ ràng.
  const data = frame.data;
  const code = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>).RE_LOGIN_CODE
    : undefined;
  return {
    event: 'LOGIN',
    status: 'success',
    data: typeof code === 'string' && code.trim() ? { RE_LOGIN_CODE: code } : undefined,
  };
}
