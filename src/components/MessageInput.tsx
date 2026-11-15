import { type FormEvent, useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addMessage, removeMessage, replaceMessage } from "../features/messages/messagesSlice";
import { peopleChatService } from "../services/peopleChatService";
import { uploadMedia } from "../services/mediaUpload";
import { encodeMediaMessage, type LyraMediaKind } from "../services/mediaMessage";
import type { AppDispatch, RootState } from "../store/store";

type MessageInputProps = {
  chatId: string;
  currentUserId: string;
  onMessageSent?: () => void;
};

export default function MessageInput({ chatId, currentUserId, onMessageSent }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedKind = useRef<LyraMediaKind>("file");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojis = ["😀", "😄", "😂", "🥰", "😍", "😊", "😉", "😎", "🥹", "😭", "😢", "😡", "👍", "👎", "👏", "🙏", "💪", "🤝", "❤️", "💚", "💛", "🎉", "🔥", "✨", "👋", "✅", "💯", "🌸", "🌿", "🍀"];

  useEffect(() => {
    if (!emojiOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!emojiPanelRef.current?.contains(event.target as Node)) setEmojiOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [emojiOpen]);

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? content.length;
    const end = input?.selectionEnd ?? content.length;
    const next = content.slice(0, start) + emoji + content.slice(end);
    setContent(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const dispatch = useDispatch<AppDispatch>();
  const messages = useSelector((state: RootState) => state.messages.messages);

  const sendContent = async (value: string, clearInput = false) => {
    const trimmedContent = value.trim();
    if (!trimmedContent) return;
    const knownMessageIds = messages.filter(m => m.chatId === chatId).map(m => m.id);
    const sentAt = new Date().toISOString();
    const optimisticId = crypto.randomUUID();
    if (clearInput) setContent("");
    dispatch(addMessage({
      id: optimisticId, chatId, senderId: currentUserId, senderName: currentUserId,
      recipientId: chatId, recipientName: chatId, content: trimmedContent,
      createdAt: sentAt, orderAt: sentAt, type: 0,
    }));
    try {
      const confirmed = await peopleChatService.sendMessage(currentUserId, chatId, trimmedContent, knownMessageIds);
      if (!confirmed) throw new Error("Máy chủ chưa xác nhận tin nhắn. Không thể coi đây là gửi thành công.");
      dispatch(replaceMessage({ id: optimisticId, message: { ...confirmed, orderAt: sentAt } }));
      onMessageSent?.();
    } catch (error) {
      dispatch(removeMessage({ chatId, id: optimisticId }));
      if (clearInput) setContent(previous => previous || trimmedContent);
      throw error;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try { await sendContent(content, true); }
    catch (error) { alert(error instanceof Error ? error.message : "Không gửi được tin nhắn."); }
  };

  const chooseMedia = (kind: LyraMediaKind) => {
    selectedKind.current = kind;
    if (fileInputRef.current) {
      fileInputRef.current.accept = kind === "image" ? "image/*" : kind === "video" ? "video/*" : kind === "gif" ? "image/gif" : ".pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx,image/*,video/*";
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleMediaFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const media = await uploadMedia(file, selectedKind.current);
      await sendContent(encodeMediaMessage(media));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không gửi được tệp.");
    } finally { setUploading(false); }
  };

  return (
    <form className="message-input-container" onSubmit={handleSubmit}>
      <input ref={fileInputRef} type="file" hidden onChange={e => void handleMediaFile(e.target.files?.[0])} />
      <div className="media-actions">
        <button type="button" title="Gửi ảnh" disabled={uploading} onClick={() => chooseMedia("image")}><i className="bi bi-image" /></button>
        <button type="button" title="Gửi video" disabled={uploading} onClick={() => chooseMedia("video")}><i className="bi bi-camera-video" /></button>
        <button type="button" title="Gửi tệp" disabled={uploading} onClick={() => chooseMedia("file")}><i className="bi bi-paperclip" /></button>
        <button type="button" title="Gửi GIF" disabled={uploading} onClick={() => chooseMedia("gif")}>GIF</button>
      </div>
      <div className="emoji-picker-anchor" ref={emojiPanelRef}>
        <button
          type="button"
          className="emoji-toggle"
          aria-label="Chọn biểu tượng cảm xúc"
          title="Gửi emoji"
          aria-expanded={emojiOpen}
          onClick={() => setEmojiOpen((open) => !open)}
        >
          <i className="bi bi-emoji-smile" aria-hidden="true" />
        </button>
        {emojiOpen && (
          <div className="emoji-picker" role="group" aria-label="Biểu tượng cảm xúc">
            <div className="emoji-picker-title">Chọn emoji</div>
            <div className="emoji-picker-grid">
              {emojis.map((emoji) => (
                <button key={emoji} type="button" className="emoji-choice" title={emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        className="message-input"
        type="text"
        placeholder={"Nhập tin nhắn..."}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        aria-label={"Nội dung tin nhắn"}
      />
      <button className="send-button" type="submit" disabled={!content.trim() || uploading}>
        {uploading ? "Đang tải..." : "Gửi"}
      </button>
    </form>
  );
}
