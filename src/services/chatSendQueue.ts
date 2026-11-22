/**
 * SEND_CHAT is shared by people and room messages and has no client request ID.
 * Serialize outgoing requests across both modes to reduce misattributed ACKs.
 */
let pending: Promise<void> = Promise.resolve();
export function enqueueChatSend<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.catch(() => undefined).then(operation);
  pending = result.then(() => undefined, () => undefined);
  return result;
}
