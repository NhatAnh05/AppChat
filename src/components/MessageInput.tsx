import { type FormEvent, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { addMessage, removeMessage, replaceMessage } from "../features/messages/messagesSlice";
import { peopleChatService } from "../services/peopleChatService";
import type { AppDispatch, RootState } from "../store/store";

type MessageInputProps = {
  chatId: string;
  currentUserId: string;
  onMessageSent?: () => void;
};

export default function MessageInput({ chatId, currentUserId, onMessageSent }: MessageInputProps) {
  const [content, setContent] = useState("");
  const dispatch = useDispatch<AppDispatch>();
  const messages = useSelector((state: RootState) => state.messages.messages);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    const knownMessageIds = messages
      .filter((message) => message.chatId === chatId)
      .map((message) => message.id);
    const sentAt = new Date().toISOString();
    const optimisticId = crypto.randomUUID();
    setContent("");
    dispatch(addMessage({
      id: optimisticId,
      chatId,
      senderId: currentUserId,
      senderName: currentUserId,
      recipientId: chatId,
      recipientName: chatId,
      content: trimmedContent,
      createdAt: sentAt,
      orderAt: sentAt,
      type: 0,
    }));

    try {
      const sentMessage = await peopleChatService.sendMessage(
        currentUserId,
        chatId,
        trimmedContent,
        knownMessageIds,
      );
      if (sentMessage) {
        dispatch(replaceMessage({
          id: optimisticId,
          message: { ...sentMessage, orderAt: sentAt },
        }));
        onMessageSent?.();
      }
    } catch (error) {
      dispatch(removeMessage({ chatId, id: optimisticId }));
      setContent((currentContent) => currentContent || trimmedContent);
      const reason = error instanceof Error ? error.message : "Không gửi được tin nhắn. Vui lòng thử lại.";
      alert(`${reason}\n\nNội dung liên quan: ${trimmedContent}`);
    }
  };

  return (
    <form className="message-input-container" onSubmit={handleSubmit}>
      <input
        className="message-input"
        type="text"
        placeholder={"Nhập tin nhắn..."}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        aria-label={"Nội dung tin nhắn"}
      />
      <button className="send-button" type="submit" disabled={!content.trim()}>
        {"Gửi"}
      </button>
    </form>
  );
}
