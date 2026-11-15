import { formatChatTime } from "../utils/chatTime";
import { parseMediaMessage } from "../services/mediaMessage";
import type { ChatMessage } from "../types/chat";

type MessageItemProps = {
  message: ChatMessage;
  currentUserId: string;
};

export default function MessageItem({ message, currentUserId }: MessageItemProps) {
  const media = parseMediaMessage(message.content);
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
          <time className="message-time">{formatChatTime(message.createdAt, true)}</time>
        </div>
        <div className="message-body">
          {!isSent && <span className="message-sender-avatar" aria-hidden="true">{senderInitials}</span>}
          <div className="message-bubble">
            {media ? (
              <div className="chat-media">
                {(media.kind === "image" || media.kind === "gif") && <a href={media.url} target="_blank" rel="noopener noreferrer"><img src={media.url} alt={media.name} loading="lazy" /></a>}
                {media.kind === "video" && <video src={media.url} controls preload="metadata" />}
                {media.kind === "file" && <a className="media-file-link" href={media.url} target="_blank" rel="noopener noreferrer" download><i className="bi bi-file-earmark-arrow-down" /> Tải tệp đính kèm</a>}
              </div>
            ) : <p className="message-content">{message.content}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
