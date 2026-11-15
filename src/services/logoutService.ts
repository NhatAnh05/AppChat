import { beginLogoutSession, disconnectLoginSession } from './loginService.ts';
import { makeLogoutRequest, readLogoutResponse } from './logoutProtocol.ts';

export type LogoutReason = 'confirmed' | 'no-connection' | 'rejected' | 'timeout' | 'disconnected' | 'aborted' | 'send-error';
export interface LogoutResult {
  backendConfirmed: boolean;
  reason: LogoutReason;
}

const ACK_TIMEOUT_MS = 5000; // Frontend policy; not specified by chat_API.xlsx.
let pendingLogout: Promise<LogoutResult> | null = null;

/** Wait only for LOGOUT response; unrelated messages must not finish this operation. */
function sendAndWaitForLogout(socket: WebSocket, signal?: AbortSignal, timeoutMs = ACK_TIMEOUT_MS): Promise<LogoutResult> {
  return new Promise(resolve => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (reason: LogoutReason) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ backendConfirmed: reason === 'confirmed', reason });
    };
    const onMessage = (message: MessageEvent) => {
      if (typeof message.data !== 'string') return;
      const response = readLogoutResponse(message.data);
      if (!response) return;
      finish(response.status === 'success' ? 'confirmed' : 'rejected');
    };
    const onError = () => finish('disconnected');
    const onClose = () => finish('disconnected');
    const onAbort = () => finish('aborted');

    if (signal?.aborted) { finish('aborted'); return; }
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { finish('aborted'); return; }
    timeout = setTimeout(() => finish('timeout'), Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : ACK_TIMEOUT_MS);
    try {
      if (socket.readyState !== WebSocket.OPEN) { finish('disconnected'); return; }
      socket.send(JSON.stringify(makeLogoutRequest()));
    } catch { finish('send-error'); }
  });
}

/**
 * API #4 logout. Locks reconnect BEFORE sending and always clears local state.
 * A local logout without ACK is never reported as a backend-confirmed logout.
 */
export function logoutCurrentSession(options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<LogoutResult> {
  if (pendingLogout) return pendingLogout; // double click -> one request

  const socket = beginLogoutSession();
  const task = (async (): Promise<LogoutResult> => {
    try {
      if (options.signal?.aborted) return { backendConfirmed: false, reason: 'aborted' };
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return { backendConfirmed: false, reason: 'no-connection' };
      }
      return await sendAndWaitForLogout(socket, options.signal, options.timeoutMs);
    } finally {
      // Cleanup even on rejected response, network error, timeout, or cancellation.
      disconnectLoginSession();
    }
  })();
  pendingLogout = task;
  void task.finally(() => { if (pendingLogout === task) pendingLogout = null; });
  return task;
}
