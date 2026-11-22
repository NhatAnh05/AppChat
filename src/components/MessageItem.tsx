import { formatChatTime } from "../utils/chatTime";
import { parseMediaMessage } from "../services/mediaMessage";
import { parseInteraction } from "../services/messageInteractions";
import { useState } from "react";
import type { ChatMessage } from "../types/chat";

type MessageItemProps = {
  message: ChatMessage;
  currentUserId: string;
  reactions?: string[];
  currentReactions?: string[];
  onReaction?: (emoji: string) => void;
  onReply?: () => void;
  onJumpReply?: (id: string) => void;
};

const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];
export default function MessageItem({ message, currentUserId, reactions = [], currentReactions = [], onReaction, onReply, onJumpReply }: MessageItemProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const interaction = parseInteraction(message.content);
  const reply = interaction?.kind === "reply" ? interaction.reply : null;
  const displayContent = interaction?.kind === "reply" ? interaction.text : message.content;
  const media = parseMediaMessage(displayContent);
  const isSent = message.senderId.toLocaleLowerCase() === currentUserId.toLocaleLowerCase();
  const senderName = message.senderName ?? message.senderId;
  const senderInitials = senderName.trim().slice(0, 2).toUpperCase();
  const recipient = message.recipientName ? ` đến ${message.recipientName}` : "";

  return (
    <div id={`lyra-message-${message.id}`} className={`message-row ${isSent ? "sent" : "received"}`} title={`Từ ${senderName}${recipient}`}>
      <div className="message-content-wrap">
        <div className="message-meta">
          <strong className="message-sender-name">{senderName}</strong>
          <span aria-hidden="true">-</span>
          <time className="message-time">{formatChatTime(message.createdAt, true)}</time>
        </div>
        <div className="message-body">
          {!isSent && <span className="message-sender-avatar" aria-hidden="true">{senderInitials}</span>}
          <div className="lyra-message-core">
          {reply && <button type="button" className="lyra-replied-preview" title="Đi đến tin nhắn gốc" onClick={() => onJumpReply?.(reply.id)}>
            <strong>↪ {reply.sender}</strong><span>{reply.excerpt}</span>
          </button>}
          <div className="message-bubble">
            {media ? (
              <div className="chat-media">
                {(media.kind === "image" || media.kind === "gif") && <a href={media.url} target="_blank" rel="noopener noreferrer"><img src={media.url} alt={media.name} loading="lazy" /></a>}
                {media.kind === "video" && <video src={media.url} controls preload="metadata" />}
                {media.kind === "file" && <a className="media-file-link" href={media.url} target="_blank" rel="noopener noreferrer" download><i className="bi bi-file-earmark-arrow-down" /> Tải tệp đính kèm</a>}
              </div>
            ) : <p className="message-content">{displayContent}</p>}
          </div>
          <div className="lyra-message-actions">
            <button type="button" onClick={onReply} title="Trả lời tin nhắn" aria-label="Trả lời tin nhắn"><i className="bi bi-reply" /></button>
            <div className="lyra-react-anchor">
              <button type="button" onClick={() => setPickerOpen(v => !v)} title="Thả cảm xúc" aria-label="Thả cảm xúc"><i className="bi bi-emoji-smile" /></button>
              {pickerOpen && <div className="lyra-react-picker" role="group" aria-label="Chọn cảm xúc">
                {REACTIONS.map(emoji => <button key={emoji} type="button" className={currentReactions.includes(emoji) ? "is-active" : ""} title={currentReactions.includes(emoji) ? "Gỡ cảm xúc" : `Thêm ${emoji}`}
                  onClick={() => { onReaction?.(emoji); }}>{emoji}</button>)}
              </div>}
            </div>
          </div>
          {reactions.length > 0 && <div className="lyra-message-reactions">{Array.from(new Set(reactions)).map(emoji => <button key={emoji} type="button" className={currentReactions.includes(emoji) ? "mine" : ""}
            title="Bấm để thả hoặc gỡ cảm xúc" onClick={() => onReaction?.(emoji)}>{emoji}<small>{reactions.filter(e => e === emoji).length}</small></button>)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
