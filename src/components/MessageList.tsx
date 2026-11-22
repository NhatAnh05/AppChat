import { parseChatTime } from "../utils/chatTime";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchPeopleChatHistory, fetchRoomChatHistory } from "../features/messages/messagesSlice";
import type { AppDispatch, RootState } from "../store/store";
import MessageItem from "./MessageItem";
import { parseInteraction, visibleMessageContent, makeReaction, type ReplyReference } from "../services/messageInteractions";
import { peopleChatService } from "../services/peopleChatService";
import { sendRoomMessage } from "../services/roomChatService.ts";
import { roomNameFromChatId } from "../services/roomChatProtocol.ts";
import { addMessage } from "../features/messages/messagesSlice";
import { applyReactionEvent, type ReactionEvent, type ReactionState } from "../services/reactionState";

type MessageListProps = {
  chatId: string;
  currentUserId: string;
  username: string;
  isPeopleChat: boolean;
  onReply?: (reply: ReplyReference) => void;
};

export default function MessageList({ chatId, currentUserId, username, isPeopleChat, onReply }: MessageListProps) {
  const dispatch = useDispatch<AppDispatch>();
  // Render the new reaction immediately, while the server confirmation is pending.
  // The pending operation stays visible until the confirmed event enters Redux.
  const [pending, setPending] = useState<ReactionEvent[]>([]);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const pendingRef = useRef<ReactionEvent[]>([]);
  const pendingSequence = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = useSelector((state: RootState) => state.messages.messages);
  const history = useSelector((state: RootState) => state.messages.historyByChat[chatId]);

  const chatMessages = messages
      .filter((message) => message.chatId === chatId)
      .slice()
      .sort((a, b) => parseChatTime(a.orderAt ?? a.createdAt) - parseChatTime(b.orderAt ?? b.createdAt));

  const reactions: ReactionState = new Map();
  for (const message of chatMessages) {
    const event = parseInteraction(message.content);
    if (event?.kind === "reaction") {
      applyReactionEvent(reactions, {targetId:event.targetId, senderId:message.senderId,
        emoji:event.emoji, operation:event.operation});
    }
  }
  for (const event of pending) applyReactionEvent(reactions, event);
  const visibleMessages = chatMessages.filter(m => parseInteraction(m.content)?.kind !== "reaction");
  const latestMessageId = visibleMessages.at(-1)?.id;

  const updatePending = (next: ReactionEvent[]) => {
    pendingRef.current = next;
    setPending(next);
  };
  const reactTo = (targetId: string, emoji: string) => {
    const mine = reactions.get(targetId)?.get(currentUserId.toLowerCase()) ?? new Set<string>();
    const operation: "add" | "remove" = mine.has(emoji) ? "remove" : "add";
    const event: ReactionEvent = {targetId, senderId:currentUserId, emoji, operation,
      localId:String(++pendingSequence.current)};
    updatePending([...pendingRef.current, event]);
    setReactionError(null);
    const content = makeReaction(targetId, emoji, operation);
    // Do not block the button. Sending is queued safely by the existing chat service.
    void (async () => {
      try {
        if (isPeopleChat) {
          const confirmed = await peopleChatService.sendMessage(currentUserId, chatId, content, []);
          if (!confirmed) throw new Error("Máy chủ chưa xác nhận cảm xúc.");
          dispatch(addMessage(confirmed));
        } else {
          const confirmed = await sendRoomMessage(roomNameFromChatId(chatId), content);
          dispatch(addMessage({...confirmed, orderAt:new Date().toISOString()}));
        }
      } catch (error) {
        // Only roll back this particular action; other rapid taps remain intact.
        console.warn("Không thể đồng bộ cảm xúc:", error);
        setReactionError(error instanceof Error ? error.message : "Không thể đồng bộ cảm xúc.");
      } finally {
        updatePending(pendingRef.current.filter(item => item.localId !== event.localId));
      }
    })();
  };
  useEffect(() => { updatePending([]); setReactionError(null); }, [chatId]);
  const firstPageLoaded = history?.loadedPages.includes(1) ?? false;
  const nextPage = Math.max(0, ...(history?.loadedPages ?? [])) + 1;

  useEffect(() => {
    if (firstPageLoaded) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [chatId, firstPageLoaded, latestMessageId]);

  const loadPage = (page: number) => {
    void dispatch(isPeopleChat ? fetchPeopleChatHistory({username, chatId, page}) : fetchRoomChatHistory({username, chatId, page}));
  };

  return (
      <div className="message-list">
        {reactionError && <div className="history-error" role="alert">
          <span>Không đồng bộ được cảm xúc: {reactionError}</span>
          <button type="button" onClick={() => setReactionError(null)}>Đóng</button>
        </div>}
        {history?.hasMore && (
            <button className="history-load-more" type="button" onClick={() => loadPage(nextPage)} disabled={history.loading}>
              {history.loading && nextPage > 1 ? "Đang tải tin nhắn cũ hơn..." : "Tải tin nhắn cũ hơn"}
            </button>
        )}

        {history?.error && (
            <div className="history-error" role="alert">
              <span>{history.error}</span>
              <button type="button" onClick={() => loadPage(firstPageLoaded ? nextPage : 1)} disabled={history.loading}>
                Thử lại
              </button>
            </div>
        )}

        {(history?.loading || !history) && chatMessages.length === 0 && (
            <p className="empty-messages">Đang tải lịch sử tin nhắn...</p>
        )}

        {chatMessages.length === 0 && !((history?.loading || !history || history.error)) && (
            <p className="empty-messages">
              {isPeopleChat ? "Chưa có lịch sử tin nhắn." : "Chưa có tin nhắn. Hãy bắt đầu trò chuyện!"}
            </p>
        )}

        {visibleMessages.map((message) => (
            <MessageItem key={`${message.chatId}-${message.id}`} message={message} currentUserId={currentUserId}
              reactions={Array.from(reactions.get(message.id)?.values() ?? []).flatMap(set => [...set])}
              currentReactions={[...(reactions.get(message.id)?.get(currentUserId.toLowerCase()) ?? new Set<string>())]}
              onReaction={(emoji) => void reactTo(message.id, emoji)}
              onReply={() => onReply?.({ id: message.id, sender: message.senderName ?? message.senderId,
                  excerpt: visibleMessageContent(message.content).slice(0, 120) })}
              onJumpReply={(id) => document.getElementById(`lyra-message-${CSS.escape(id)}`)?.scrollIntoView({behavior:'smooth',block:'center'})}
            />
        ))}
        <div ref={bottomRef} />
      </div>
  );
}
