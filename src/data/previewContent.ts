/** Compatibility types for legacy local-only helpers still bundled with this React/Redux source.
 * The active chat UI uses src/types/chat.ts; these types never fabricate server data. */
export interface Message {
  id: string;
  fromMe: boolean;
  time: string;
  text?: string;
  createdAt?: string;
  clientSentAt?: number;
  clientReceivedAt?: number;
  day?: string;
  fileName?: string;
  fileDetail?: string;
  replyTo?: string;
  emoji?: string;
  attachment?: 'photo' | 'file';
  edited?: boolean;
}
export interface Conversation {
  id: string;
  name: string;
  initial: string;
  color: string;
  preview: string;
  time: string;
  unread: number;
  group: boolean;
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
}
