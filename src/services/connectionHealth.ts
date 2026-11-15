/** Public connection states without exposing the RE_LOGIN_CODE. */
export type ChatConnectionState = 'connected' | 'reconnecting' | 'offline' | 'signing-out' | 'signed-out';
type Listener = (state: ChatConnectionState) => void;
const listeners = new Set<Listener>();
let current: ChatConnectionState = 'signed-out';
export const getConnectionState = (): ChatConnectionState => current;
export const subscribeConnectionState = (listener: Listener): (() => void) => {
  listeners.add(listener);
  listener(current);
  return () => { listeners.delete(listener); };
};
export function setConnectionState(state: ChatConnectionState): void {
  if (current === state) return;
  current = state;
  for (const listener of listeners) listener(state);
}
