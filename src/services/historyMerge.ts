/** Reconcile server history with optimistic messages without inventing delivery receipts. */
import type { Message } from '../data/previewContent';

const provisional = (id: string) => /^(local|unverified|failed|ack|live):/.test(id);

/** A server record is authoritative. Never turn a local-only record into a server receipt unless its time matches. */
export function mergeServerHistory(previous: Message[], serverPage: Message[], page: number): Message[] {
  const serverById = new Map<string, Message>();
  const retained: Message[] = [];
  // Preserve server-confirmed live events even if a paged response arrives later.
  // Page is retained for API symmetry; the server may return a partial first page.
  void page;
  for (const message of previous) {
    if (!provisional(message.id)) serverById.set(message.id, message);
  }
  for (const message of serverPage) serverById.set(message.id, message);
  const confirmed = [...serverById.values()];
  const used = new Set<number>();
  for (const message of previous) {
    if (!provisional(message.id)) continue;
    const match = confirmed.findIndex((record, index) => {
      if (used.has(index) || record.fromMe !== message.fromMe || record.text !== message.text) return false;
      const a = record.createdAt ? Date.parse(record.createdAt) : NaN;
      const b = message.fromMe ? message.clientSentAt : message.clientReceivedAt;
      return Number.isFinite(a) && typeof b === 'number' && Math.abs(a - b) <= 5 * 60_000;
    });
    if (match >= 0) used.add(match);
    else retained.push(message);
  }
  // History is often returned latest-first, so sort timestamped items ascending.
  // Untimestamped pending messages stay after server-confirmed history.
  confirmed.sort((a, b) => {
    const x = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const y = b.createdAt ? Date.parse(b.createdAt) : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    return x - y;
  });
  return [...confirmed, ...retained];
}
