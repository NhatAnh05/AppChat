/** API #3 RE_LOGIN — chat_API.xlsx / 0Sheet1 / row 4. */
export interface ReLoginRequest {
  action: 'onchat';
  data: { event: 'RE_LOGIN'; data: { user: string; code: string } };
}

export type ReLoginResponse =
  | { event: 'RE_LOGIN'; status: 'success'; data?: { RE_LOGIN_CODE: string } }
  | { event: 'RE_LOGIN'; status: 'error'; mes: string };

export function makeReLoginRequest(username: string, code: string): ReLoginRequest {
  return { action: 'onchat', data: { event: 'RE_LOGIN', data: { user: username, code } } };
}

/** Ignore unrelated push events and malformed JSON; never fabricate a session code. */
export function readReLoginResponse(raw: string): ReLoginResponse | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const frame = value as Record<string, unknown>;
  if (frame.event !== 'RE_LOGIN' || (frame.status !== 'success' && frame.status !== 'error')) return null;
  if (frame.status === 'error') {
    return { event: 'RE_LOGIN', status: 'error', mes: typeof frame.mes === 'string' ? frame.mes : 'Phiên đăng nhập không còn hợp lệ.' };
  }
  const data = frame.data;
  const code = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>).RE_LOGIN_CODE : undefined;
  return {
    event: 'RE_LOGIN', status: 'success',
    data: typeof code === 'string' && code.trim() ? { RE_LOGIN_CODE: code } : undefined,
  };
}
