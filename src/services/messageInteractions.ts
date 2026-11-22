/** Client-side extension over the teacher server's ordinary SEND_CHAT message body.
 * No new WebSocket event is invented. Both clients must use this LyraChat version.
 */
const PREFIX = "LYRA_INTERACT_V1:";
export type ReplyReference = { id: string; sender: string; excerpt: string };
export type Interaction =
  | { kind: "reply"; reply: ReplyReference; text: string }
  | { kind: "reaction"; targetId: string; emoji: string; operation?: "add" | "remove" };

function pack(value: Interaction): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return PREFIX + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
export function makeReply(text: string, reply: ReplyReference): string {
  return pack({kind: "reply", text: text.trim(), reply: {
    id: reply.id, sender: reply.sender.slice(0, 80), excerpt: reply.excerpt.slice(0, 120),
  }});
}
export function makeReaction(targetId: string, emoji: string, operation?: "add" | "remove"): string {
  return pack({kind: "reaction", targetId, emoji, ...(operation ? {operation} : {})});
}
export function parseInteraction(content: string): Interaction | null {
  if (!content.startsWith(PREFIX) || content.length > 18000) return null;
  try {
    const payload = content.slice(PREFIX.length);
    if (!/^[A-Za-z0-9_-]+$/.test(payload)) return null;
    const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (value.kind === "reaction" && typeof value.targetId === "string" && value.targetId.length <= 100 &&
        typeof value.emoji === "string" && value.emoji.length <= 12 &&
        (value.operation === undefined || value.operation === "add" || value.operation === "remove"))
      return {kind: "reaction", targetId: value.targetId, emoji: value.emoji,
        ...(value.operation ? {operation: value.operation as "add" | "remove"} : {})};
    if (value.kind === "reply" && typeof value.text === "string" && value.text.length <= 6000 && value.reply && typeof value.reply === "object") {
      const reply = value.reply as Record<string, unknown>;
      if (typeof reply.id === "string" && typeof reply.sender === "string" && typeof reply.excerpt === "string" &&
          reply.id.length <= 100 && reply.sender.length <= 80 && reply.excerpt.length <= 120)
        return {kind:"reply", text: value.text, reply: {id:reply.id, sender:reply.sender, excerpt:reply.excerpt}};
    }
  } catch { /* Malformed content should remain ordinary text. */ }
  return null;
}
export function visibleMessageContent(content: string): string {
  const parsed = parseInteraction(content);
  return parsed?.kind === "reply" ? parsed.text : content;
}
