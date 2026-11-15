import type { ChatMessage } from "../types/chat";

type MessageItemProps = {
  message: ChatMessage;
  currentUserId: string;
};

function formatMessageDate(value: string) {
  const apiDate = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/);
  if (apiDate) {
    const [, year, month, day, hour, minute] = apiDate;
    return `${hour}:${minute} ${day}/${month}/${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const twoDigits = (number: number) => String(number).padStart(2, "0");
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())} ${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export default function MessageItem({ message, currentUserId }: MessageItemProps) {
  const isSent = message.senderId.toLocaleLowerCase() === currentUserId.toLocaleLowerCase();
  const senderName = message.senderName ?? message.senderId;
  const senderInitials = senderName.trim().slice(0, 2).toUpperCase();
  const recipient = message.recipientName ? ` đến ${message.recipientName}` : "";

  return (
    <div className={`message-row ${isSent ? "sent" : "received"}`} title={`Từ ${senderName}${recipient}`}>
      <div className="message-content-wrap">
        <div className="message-meta">
          <strong className="message-sender-name">{senderName}</strong>
          <span aria-hidden="true">-</span>
          <time className="message-time">{formatMessageDate(message.createdAt)}</time>
        </div>
        <div className="message-body">
          {!isSent && <span className="message-sender-avatar" aria-hidden="true">{senderInitials}</span>}
          <div className="message-bubble">
            <p className="message-content">{message.content}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
