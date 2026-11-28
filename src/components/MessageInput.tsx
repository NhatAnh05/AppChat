import { currentSessionSignal, assertCurrentSession, isCurrentSession } from '../services/sessionScope.ts';
import { type FormEvent, useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addMessage, setMessageStatus, replaceMessage, fetchPeopleChatHistory, fetchRoomChatHistory } from "../features/messages/messagesSlice";
import { peopleChatService, UnconfirmedSendError } from "../services/peopleChatService";
import { sendRoomMessage } from "../services/roomChatService.ts";
import { roomNameFromChatId } from "../services/roomChatProtocol.ts";
import { uploadMedia } from "../services/mediaUpload";
import { encodeMediaMessage, type LyraMediaKind } from "../services/mediaMessage";
import { makeReply, type ReplyReference } from "../services/messageInteractions";
import type { AppDispatch, RootState } from "../store/store";
import { hasLinkedServerHistory } from "../services/chatHistoryReconciliation.ts";
import { readDraft, saveDraft } from "../services/conversationStorage.ts";

type MessageInputProps = {
  chatId: string;
  currentUserId: string;
  onMessageSent?: () => void;
  isGroup?: boolean;
  replyTo?: ReplyReference | null;
  mentionRequest?: {id:number;text:string}|null;
  onCancelReply?: () => void;
};

export default function MessageInput({ chatId, currentUserId, onMessageSent, isGroup = false, replyTo, mentionRequest, onCancelReply }: MessageInputProps) {
  const [workspaceSession] = useState(currentSessionSignal);
  const [content, setContent] = useState(() => readDraft(currentUserId, chatId));
  // Tự động lưu bản nháp theo tài khoản/hội thoại ngay khi nội dung thay đổi.
  useEffect(() => saveDraft(currentUserId, chatId, content), [currentUserId, chatId, content]);
  const [sending, setSending] = useState(false);
  const [inputError, setInputError] = useState('');
  const [uncertainId, setUncertainId] = useState<string | null>(null);
  const appliedMention = useRef<number | null>(null);
  useEffect(() => {
    if (!mentionRequest || appliedMention.current === mentionRequest.id) return;
    appliedMention.current = mentionRequest.id;
    setContent(previous => `${previous}${previous && !/\s$/.test(previous) ? ' ' : ''}${mentionRequest.text}`);
    inputRef.current?.focus();
  }, [mentionRequest]);
  const sendBusyRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const uploadBusyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedKind = useRef<LyraMediaKind>("file");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const mediaMenuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!mediaMenuOpen) return;
    const closeWhenOutside = (event: PointerEvent) => {
      if (!mediaMenuRef.current?.contains(event.target as Node)) setMediaMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMediaMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mediaMenuOpen]);

  const insertEmoji = (emoji: string) => {
    setInputError('');
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

  const linkedHistory = hasLinkedServerHistory(messages, chatId, uncertainId);
  const visibleError = linkedHistory ? '' : inputError;

  const sendContent = async (value: string, clearInput = false, session = workspaceSession) => {
    assertCurrentSession(session);
    const trimmedContent = value.trim();
    if (!trimmedContent) return;
    if (sendBusyRef.current) throw new Error("Đang gửi một tin nhắn khác, vui lòng thử lại.");
    sendBusyRef.current = true;
    setSending(true);
    const knownMessageIds = messages.filter(m => m.chatId === chatId).map(m => m.id);
    const sentAt = new Date().toISOString();
    const optimisticId = `local:${crypto.randomUUID()}`;
    if (clearInput) setContent("");
    dispatch(addMessage({
      id: optimisticId, chatId, senderId: currentUserId, senderName: currentUserId,
      recipientId: isGroup ? roomNameFromChatId(chatId) : chatId, content: trimmedContent,
      createdAt: sentAt, orderAt: sentAt, knownServerIds:knownMessageIds.filter(id=>! /^(local|live|ack):/.test(id)), type: isGroup ? 1 : 0, sendStatus:'pending',
    }));
    try {
      const confirmed = isGroup
        ? await sendRoomMessage(roomNameFromChatId(chatId), trimmedContent, {knownMessageIds})
        : await peopleChatService.sendMessage(currentUserId, chatId, trimmedContent, knownMessageIds);
      assertCurrentSession(session);
      if (!confirmed) throw new UnconfirmedSendError("Máy chủ chưa xác nhận tin nhắn.");
      dispatch(replaceMessage({ id: optimisticId, message: { ...confirmed, chatId, orderAt: sentAt, sendStatus:'confirmed' } }));
      onMessageSent?.();
      if (clearInput) onCancelReply?.();
    } catch (error) {
      if (isCurrentSession(session)) {
        const uncertain = error instanceof UnconfirmedSendError;
        dispatch(setMessageStatus({chatId,id:optimisticId,status:uncertain?'unconfirmed':'failed'}));
        if (uncertain) {
          setUncertainId(optimisticId);
          const args={username:isGroup?roomNameFromChatId(chatId):chatId,chatId,page:1,force:true};
          void dispatch(isGroup?fetchRoomChatHistory(args):fetchPeopleChatHistory(args));
        } else if (clearInput) setContent(previous => previous || content);
      }
      throw error;
    } finally { sendBusyRef.current=false; setSending(false); }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (uploadBusyRef.current || sendBusyRef.current) return;
    setUncertainId(null);
    setInputError('');
    try { await sendContent(replyTo ? makeReply(content, replyTo) : content, true); }
    catch (error) { setInputError(error instanceof Error ? error.message : "Không gửi được tin nhắn."); }
  };

  const chooseMedia = (kind: LyraMediaKind) => {
    if (uploadBusyRef.current || sendBusyRef.current) return;
    setMediaMenuOpen(false);
    selectedKind.current = kind;
    if (fileInputRef.current) {
      fileInputRef.current.accept = kind === "image" ? "image/*" : kind === "video" ? "video/*" : kind === "gif" ? "image/gif" : ".pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx,image/*,video/*";
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleMediaFile = async (file?: File) => {
    if (!file || uploadBusyRef.current || sendBusyRef.current || !isCurrentSession(workspaceSession)) return;
    uploadBusyRef.current = true;
    setUncertainId(null);
    setInputError('');
    setUploading(true);
    const session = workspaceSession;
    try {
      const media = await uploadMedia(file, selectedKind.current, currentUserId, isGroup ? roomNameFromChatId(chatId) : chatId, isGroup, session);
      assertCurrentSession(session);
      await sendContent(encodeMediaMessage(media), false, session);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Không gửi được tệp.");
    } finally { uploadBusyRef.current = false; setUploading(false); }
  };

  const kindFromFile = (file: File): LyraMediaKind => file.type === 'image/gif' ? 'gif' :
    file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
  const pasteMedia = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const file = event.clipboardData.files.item(0);
    if (!file) return; // Giữ nguyên thao tác dán văn bản thông thường.
    event.preventDefault();
    selectedKind.current = kindFromFile(file);
    void handleMediaFile(file);
  };
  const dropMedia = (event: React.DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;
    selectedKind.current = kindFromFile(file);
    void handleMediaFile(file);
  };

  return (
      <form className={`message-input-container ${replyTo || visibleError ? "has-reply" : ""}`} onSubmit={handleSubmit}
        onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={dropMedia}>
        {visibleError && <div className="lyra-composer-error" role="alert">
          <span>{visibleError}</span>
          <button type="button" onClick={() => setInputError('')} aria-label="Đóng thông báo lỗi">×</button>
        </div>}
        {replyTo && <div className="lyra-reply-composer" aria-label="Đang trả lời tin nhắn">
          <i className="bi bi-reply" aria-hidden="true" />
          <div><strong>Trả lời {replyTo.sender}</strong><span>{replyTo.excerpt}</span></div>
          <button type="button" title="Hủy trả lời" aria-label="Hủy trả lời" onClick={onCancelReply}><i className="bi bi-x-lg" /></button>
        </div>}
        <input ref={fileInputRef} type="file" hidden onChange={e => void handleMediaFile(e.target.files?.[0])} />
        <div className="media-attach-anchor" ref={mediaMenuRef}>
          <button
              type="button"
              className="media-plus-toggle"
              title="Đính kèm ảnh, video, GIF hoặc tệp"
              aria-label="Thêm nội dung đính kèm"
              aria-haspopup="menu"
              aria-expanded={mediaMenuOpen}
              disabled={uploading || sending}
              onClick={() => { setEmojiOpen(false); setMediaMenuOpen(open => !open); }}
          >
            <i className={`bi ${mediaMenuOpen ? "bi-x-lg" : "bi-plus-lg"}`} aria-hidden="true" />
          </button>
          {mediaMenuOpen && (
              <div className="media-attach-menu" role="menu" aria-label="Chọn loại tệp đính kèm">
                <button type="button" role="menuitem" onClick={() => chooseMedia("image")}> <i className="bi bi-image" aria-hidden="true" /> <span>Hình ảnh</span> </button>
                <button type="button" role="menuitem" onClick={() => chooseMedia("video")}> <i className="bi bi-camera-video" aria-hidden="true" /> <span>Video</span> </button>
                <button type="button" role="menuitem" onClick={() => chooseMedia("gif")}> <i className="bi bi-filetype-gif" aria-hidden="true" /> <span>GIF</span> </button>
                <button type="button" role="menuitem" onClick={() => chooseMedia("file")}> <i className="bi bi-paperclip" aria-hidden="true" /> <span>Tệp</span> </button>
              </div>
          )}
        </div>
        <button type="button" className="quick-action-button" title="Gửi hình ảnh" aria-label="Gửi hình ảnh" disabled={uploading || sending} onClick={() => chooseMedia("image")}>
          <i className="bi bi-image" aria-hidden="true" />
        </button>
        <button type="button" className="quick-action-button" title="Đính kèm tệp" aria-label="Đính kèm tệp" disabled={uploading || sending} onClick={() => chooseMedia("file")}>
          <i className="bi bi-paperclip" aria-hidden="true" />
        </button>
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
            onPaste={pasteMedia}
            aria-label={"Nội dung tin nhắn"}
        />
        <button type="button" className="voice-action-button" title="Ghi âm" aria-label="Ghi âm">
          <i className="bi bi-mic" aria-hidden="true" />
        </button>
        <button className="send-button" type="submit" disabled={!content.trim() || uploading || sending}>
          {uploading ? "Đang tải..." : sending ? "Đang gửi..." : "Gửi"}
        </button>
      </form>
  );
}
