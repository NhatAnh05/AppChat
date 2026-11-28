/**
 * Some text-only chat backends do not persist supplementary Unicode characters.
 * Preserve normal Vietnamese text and encode only emoji-related code points as
 * short ASCII tokens. The server still receives an ordinary SEND_CHAT string.
 * Both LyraChat clients need this decoder to display the original emoji.
 * This is a compatibility workaround, not a substitute for backend Unicode support.
 */
const LITERAL_PREFIX = "LYRA_TEXT_V2:";
const LEGACY_PREFIX = "LYRAU8_";
const TOKEN = /LYE([0-9a-f]{4,6})X/g;

function needsEscaping(codePoint: number): boolean {
  return codePoint > 0xffff || codePoint === 0x2764 || codePoint === 0x263a || codePoint === 0xfe0f || codePoint === 0xfe0e ||
    codePoint === 0x200d || codePoint === 0x20e3;
}

export function encodeChatContent(content: string): string {
  // Escape literal legacy markers before the old decoder can reinterpret them.
  // Base64url is a reserved wire prefix; decoding returns once, never recursively.
  if (content.startsWith(LITERAL_PREFIX) || content.startsWith(LEGACY_PREFIX) || /LYE[0-9a-f]{4,6}X/.test(content)) {
    const bytes = new TextEncoder().encode(content);
    return LITERAL_PREFIX + btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
  }
  // Only encode when the input actually contains pictographs / emoji modifiers.
  // Do not change ordinary text (including Vietnamese accented letters).
  if (!/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u20E3\u{10000}-\u{10FFFF}]/u.test(content)) {
    return content;
  }
  return Array.from(content, (character) => {
    const point = character.codePointAt(0)!;
    return needsEscaping(point) ? `LYE${point.toString(16)}X` : character;
  }).join("");
}

export function decodeChatContent(content: string): string {
  if (content.startsWith(LITERAL_PREFIX)) {
    const payload=content.slice(LITERAL_PREFIX.length);
    if (/^[A-Za-z0-9_-]+$/.test(payload)) {
      try {return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(payload.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)));} catch {return content;}
    }
    return content;
  }
  // Backwards compatibility with messages from the previous version.
  if (content.startsWith(LEGACY_PREFIX)) {
    const payload = content.slice(LEGACY_PREFIX.length);
    if (/^[A-Za-z0-9_-]+$/.test(payload)) {
      try {
        const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch { /* Keep the original text when the payload is malformed. */ }
    }
  }
  return content.replace(TOKEN, (full, hex: string) => {
    const point = parseInt(hex, 16);
    if (!needsEscaping(point) || point > 0x10ffff) return full;
    try { return String.fromCodePoint(point); } catch { return full; }
  });
}
