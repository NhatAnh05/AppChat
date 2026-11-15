import type { Chat } from '../types/chat'

type ChatItemProps = { chat: Chat; selected: boolean; onSelect: (chat: Chat) => void }

export function ChatItem({ chat, selected, onSelect }: ChatItemProps) {
  return <button className={`chat-item ${selected ? 'is-selected' : ''}`} onClick={() => onSelect(chat)} aria-pressed={selected}>
    <span className="chat-avatar" style={{ backgroundColor: chat.avatarColor }}>{chat.avatar}{chat.online && <i className="online-dot" />}</span>
    <span className="chat-copy"><span className="chat-heading"><strong>{chat.name}</strong><time>{chat.time}</time></span><span className="chat-preview">{chat.lastMessage}</span></span>
    {chat.unreadCount ? <span className="unread-badge" aria-label={`${chat.unreadCount} tin nh\u1EAFn ch\u01B0a \u0111\u1ECDc`}>{chat.unreadCount}</span> : null}
  </button>
}
