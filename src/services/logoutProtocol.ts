/** API #4: LOGOUT is sent on the EXISTING authenticated WebSocket. */
export interface LogoutRequest {
  action: 'onchat';
  data: { event: 'LOGOUT' };
}

export type LogoutResponse =
  | { status: 'success'; data: string }
  | { status: 'error'; mes: string };

/** Do not attach user, password, RE_LOGIN_CODE, or an empty data object. */
export function makeLogoutRequest(): LogoutRequest {
  return { action: 'onchat', data: { event: 'LOGOUT' } };
}

/** Ignore unrelated/malformed packets. Success requires the server's response payload. */
export function readLogoutResponse(raw: string): LogoutResponse | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const packet = value as Record<string, unknown>;
    if (packet.event !== 'LOGOUT') return null;
    if (packet.status === 'success' && typeof packet.data === 'string') {
      return { status: 'success', data: packet.data };
    }
    if (packet.status === 'error') {
      return {
        status: 'error',
        mes: typeof packet.mes === 'string' && packet.mes.trim()
          ? packet.mes : 'Máy chủ từ chối LOGOUT.',
      };
    }
    return null;
  } catch { return null; }
}
