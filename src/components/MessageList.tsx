import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchPeopleChatHistory } from "../features/messages/messagesSlice";
import type { AppDispatch, RootState } from "../store/store";
import MessageItem from "./MessageItem";

type MessageListProps = {
  chatId: string;
  currentUserId: string;
  username: string;
  isPeopleChat: boolean;
};

function getTimestamp(value: string) {
  const localTimestamp = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (localTimestamp) {
    const [, year, month, day, hour, minute, second] = localTimestamp;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime();
  }
  return Date.parse(value);
}

export default function MessageList({ chatId, currentUserId, username, isPeopleChat }: MessageListProps) {
  const dispatch = useDispatch<AppDispatch>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = useSelector((state: RootState) => state.messages.messages);
  const history = useSelector((state: RootState) => state.messages.historyByChat[chatId]);

  const chatMessages = messages
    .filter((message) => message.chatId === chatId)
    .slice()
    .sort((a, b) => getTimestamp(a.orderAt ?? a.createdAt) - getTimestamp(b.orderAt ?? b.createdAt));

  const latestMessageId = chatMessages.at(-1)?.id;
  const firstPageLoaded = history?.loadedPages.includes(1) ?? false;
  const nextPage = Math.max(0, ...(history?.loadedPages ?? [])) + 1;

  useEffect(() => {
    if (!isPeopleChat || firstPageLoaded) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [chatId, firstPageLoaded, isPeopleChat, latestMessageId]);

  const loadPage = (page: number) => {
    void dispatch(fetchPeopleChatHistory({ username, chatId, page }));
  };

  return (
    <div className="message-list">
      {isPeopleChat && history?.hasMore && (
        <button className="history-load-more" type="button" onClick={() => loadPage(nextPage)} disabled={history.loading}>
          {history.loading && nextPage > 1 ? "Đang tải tin nhắn cũ hơn..." : "Tải tin nhắn cũ hơn"}
        </button>
      )}

      {isPeopleChat && history?.error && (
        <div className="history-error" role="alert">
          <span>{history.error}</span>
          <button type="button" onClick={() => loadPage(nextPage)} disabled={history.loading}>
            Thử lại
          </button>
        </div>
      )}

      {isPeopleChat && (history?.loading || !history) && chatMessages.length === 0 && (
        <p className="empty-messages">Đang tải lịch sử tin nhắn...</p>
      )}

      {chatMessages.length === 0 && !(isPeopleChat && (history?.loading || !history || history.error)) && (
        <p className="empty-messages">
          {isPeopleChat ? "Chưa có lịch sử tin nhắn." : "Chưa có tin nhắn. Hãy bắt đầu trò chuyện!"}
        </p>
      )}

      {chatMessages.map((message) => (
        <MessageItem key={`${message.chatId}-${message.id}`} message={message} currentUserId={currentUserId} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
