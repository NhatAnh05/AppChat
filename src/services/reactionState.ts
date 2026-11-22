/** Reactions are independent per user and emoji, not a single exclusive choice. */
export type ReactionEvent = {
  targetId: string;
  senderId: string;
  emoji: string;
  // Old V1 reactions omit operation: replace the entire user's reaction set.
  operation?: "add" | "remove";
  localId?: string;
};
export type ReactionState = Map<string, Map<string, Set<string>>>;

export function applyReactionEvent(state: ReactionState, event: ReactionEvent): void {
  const sender = event.senderId.toLowerCase();
  const bySender = state.get(event.targetId) ?? new Map<string, Set<string>>();
  const current = new Set(bySender.get(sender) ?? []);
  if (event.operation === "add") current.add(event.emoji);
  else if (event.operation === "remove") current.delete(event.emoji);
  else { current.clear(); if (event.emoji) current.add(event.emoji); }
  bySender.set(sender, current);
  state.set(event.targetId, bySender);
}
