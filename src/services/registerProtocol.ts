/** Giao thức REGISTER theo chat_API.xlsx, sheet 0Sheet1, dòng 2. */
export interface RegisterRequest {
  action: 'onchat';
  data: {
    event: 'REGISTER';
    data: { user: string; pass: string };
  };
}

export interface RegisterResponse {
  event: 'REGISTER';
  status: 'success' | 'error';
  data?: string;
  mes?: string;
}

export function makeRegisterRequest(username: string, password: string): RegisterRequest {
  return {
    action: 'onchat',
    data: {
      event: 'REGISTER',
      data: { user: username, pass: password },
    },
  };
}

/** Bỏ qua frame không phải phản hồi REGISTER; không giả định mọi frame là JSON hợp lệ. */
export function readRegisterResponse(raw: string): RegisterResponse | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (obj.event !== 'REGISTER') return null;
  if (obj.status !== 'success' && obj.status !== 'error') return null;
  return {
    event: 'REGISTER',
    status: obj.status,
    data: typeof obj.data === 'string' ? obj.data : undefined,
    mes: typeof obj.mes === 'string' ? obj.mes : undefined,
  };
}
