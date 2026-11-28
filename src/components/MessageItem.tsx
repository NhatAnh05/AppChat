import MediaViewer from "./MediaViewer";
import type { LyraMedia } from "../services/mediaMessage";
import MediaAttachment from "./MediaAttachment";
import { albumRows } from "../services/albumLayout";
import { formatChatTime } from "../utils/chatTime";
import { parseMediaCollection } from "../services/mediaMessage";
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
  bookmarked?: boolean;
  onBookmark?: () => void;
  onForward?: () => void;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  highlighted?: boolean;
};

const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];
export default function MessageItem({ message, currentUserId, reactions = [], currentReactions = [], onReaction, onReply, onJumpReply, bookmarked = false, onBookmark, onForward, selecting = false, selected = false, onSelect, highlighted = false }: MessageItemProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerIndex,setViewerIndex]=useState<number|null>(null);
  const interaction = parseInteraction(message.content);
  const reply = interaction?.kind === "reply" ? interaction.reply : null;
  const displayContent = interaction?.kind === "reply" ? interaction.text : message.content;
  const media = parseMediaCollection(displayContent);
  const viewerItems:LyraMedia[]=(media?.items??[]).flatMap(item=> (item.kind==='image'||item.kind==='gif')&&item.url ? [{kind:item.kind,url:item.url,name:item.name||'Hình ảnh',size:item.size}] : []);
  const isSent = message.senderId.toLocaleLowerCase() === currentUserId.toLocaleLowerCase();
  const senderName = message.senderName ?? message.senderId;
  const senderInitials = senderName.trim().slice(0, 2).toUpperCase();
  const stableId = !/^(local|ack|live|unverified):/.test(message.id);
  const recipient = message.recipientName ? ` đến ${message.recipientName}` : "";

  return (
    <div id={`lyra-message-${message.id}`} className={`message-row ${isSent ? "sent" : "received"} ${selecting ? "is-selecting" : ""} ${selected ? "lyra-selected-message" : ""} ${highlighted ? "lyra-search-hit" : ""}`}>
      {viewerIndex!==null && viewerItems[viewerIndex] && <MediaViewer items={viewerItems} initialIndex={viewerIndex} onClose={()=>setViewerIndex(null)}/>}
      {selecting && <input type="checkbox" className="lyra-workspace-checkbox" aria-label={`Chọn tin nhắn của ${senderName}`} checked={selected} onChange={onSelect} />}
      <div className="message-content-wrap">
        <div className="message-meta" title={`Từ ${senderName}${recipient}`}>
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
          <div className="lyra-bubble-anchor">
          <div className={`message-bubble${media ? " has-media" : ""}${media && media.items.length > 1 ? " has-album" : ""}${media && media.items.length === 1 && ['image','gif','video'].includes(media.items[0].kind) ? " has-visual-media" : ""}`}>
            {media ? <div className={media.items.length > 1 ? "lyra-media-album" : "lyra-media-single"}>
              {albumRows(media.items.map(item=>item.kind)).map((row)=> <div key={row[0]} className={media.items.length>1 ? `lyra-album-row lyra-album-row-${row.length}` : undefined}>
                {row.map(index=>{const item=media.items[index];const thumbnail=media.items.length>1 && ['image','gif'].includes(item.kind);return <div key={index} className={thumbnail?'lyra-album-tile':undefined}>
                  {item.kind==='sticker'?<span className="lyra-sticker">{item.sticker}</span>:item.url?<MediaAttachment key={item.url} thumbnail={thumbnail} onOpen={()=>setViewerIndex(media.items.slice(0,index).filter(v=>(v.kind==='image'||v.kind==='gif')&&v.url).length)} media={{kind:item.kind,url:item.url,name:item.name||'Tệp đính kèm',size:item.size}}/>:null}
                </div>})}
              </div>)}
              {media.caption && <p className="message-content">{media.caption}</p>}
            </div> : <p className="message-content">{displayContent}</p>}
          </div>
          <div className="lyra-message-actions">
            <button type="button" disabled={!stableId} onClick={onReply} title="Trả lời tin nhắn" aria-label="Trả lời tin nhắn"><i className="bi bi-reply" /></button>
            <button type="button" onClick={onBookmark} title={bookmarked ? "Bỏ lưu tin nhắn" : "Lưu tin nhắn"} aria-label={bookmarked ? "Bỏ lưu tin nhắn" : "Lưu tin nhắn"}><i className={`bi bi-${bookmarked ? "bookmark-fill" : "bookmark"}`} /></button>
            <button type="button" disabled={message.id.startsWith('unverified:backup:')||message.sendStatus==='pending'||message.sendStatus==='unconfirmed'||message.sendStatus==='failed'} onClick={onForward} title="Chuyển tiếp tin nhắn" aria-label="Chuyển tiếp tin nhắn"><i className="bi bi-forward" /></button>
            <div className="lyra-react-anchor">
              <button type="button" disabled={!stableId} onClick={() => setPickerOpen(v => !v)} title="Thả cảm xúc" aria-label="Thả cảm xúc"><i className="bi bi-emoji-smile" /></button>
              {pickerOpen && <div className="lyra-react-picker" role="group" aria-label="Chọn cảm xúc">
                {REACTIONS.map(emoji => <button key={emoji} type="button" className={currentReactions.includes(emoji) ? "is-active" : ""} title={currentReactions.includes(emoji) ? "Gỡ cảm xúc" : `Thêm ${emoji}`}
                  onClick={() => { onReaction?.(emoji); }}>{emoji}</button>)}
              </div>}
            </div>
          </div>
          </div>
          {message.id.startsWith("unverified:backup:") && <small className="message-time">Bản sao cục bộ · chưa xác minh</small>}
          {isSent && message.sendStatus && <small role="status" className="message-time lyra-message-status" title={message.sendStatus==='unconfirmed'&&message.historyMatchId===message.id?'Có bản ghi tương ứng; lần gửi chưa nhận ACK riêng. Không phải xác nhận đã đọc.':undefined}>{{pending:'Đang gửi…', confirmed:'Máy chủ đã xác nhận', unconfirmed:message.historyMatchId===message.id?'Có trong lịch sử máy chủ':'Chưa xác nhận — kiểm tra lịch sử trước khi gửi lại', failed:'Gửi thất bại'}[message.sendStatus]}</small>}
          {reactions.length > 0 && <div className="lyra-message-reactions">{Array.from(new Set(reactions)).map(emoji => <button key={emoji} type="button" className={currentReactions.includes(emoji) ? "mine" : ""}
            title="Bấm để thả hoặc gỡ cảm xúc" onClick={() => onReaction?.(emoji)}>{emoji}<small>{reactions.filter(e => e === emoji).length}</small></button>)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
