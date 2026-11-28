/** One lifetime per account login, not per reconnect. Abort old work at the boundary. */
let controller = new AbortController();
export function currentSessionSignal(): AbortSignal { return controller.signal; }
export function rotateSessionScope(): void {
  const previous = controller;
  controller = new AbortController();
  previous.abort();
}
export function isCurrentSession(signal: AbortSignal): boolean {
  return signal === controller.signal && !signal.aborted;
}
export function assertCurrentSession(signal: AbortSignal): void {
  if (!isCurrentSession(signal)) throw new Error('Phiên đăng nhập đã thay đổi. Đã hủy thao tác cũ.');
}
/** Serialize only within a session. Queued work rejects immediately on logout. */
export function sessionQueue() {
  let scope: AbortSignal | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = currentSessionSignal();
    if (scope !== signal) { scope = signal; tail = Promise.resolve(); }
    const run = tail.catch(() => undefined).then(async () => {
      assertCurrentSession(signal);
      const value = await operation(signal);
      assertCurrentSession(signal);
      return value;
    });
    tail = run;
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new Error('Phiên đăng nhập đã thay đổi. Đã hủy thao tác cũ.'));
      signal.addEventListener('abort', abort, {once:true});
      if (signal.aborted) abort();
      void run.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  };
}
