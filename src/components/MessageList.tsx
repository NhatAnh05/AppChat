import { currentSessionSignal, assertCurrentSession, isCurrentSession } from '../services/sessionScope.ts';
import { resolveLocalMediaUrl, mediaMessagePreview } from "../services/mediaMessage.ts";
import { historyDisplayMessages } from "../services/chatHistoryReconciliation.ts";
import { parseChatTime } from "../utils/chatTime";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createPortal } from "react-dom";
import { fetchPeopleChatHistory, fetchRoomChatHistory, addMessage } from "../features/messages/messagesSlice";
import type { AppDispatch, RootState } from "../store/store";
import type { ChatMessage } from "../types/chat";
import MessageItem from "./MessageItem";
import { parseInteraction, visibleMessageContent, makeReaction, type ReplyReference } from "../services/messageInteractions";
import { peopleChatService } from "../services/peopleChatService";
import { sendRoomMessage } from "../services/roomChatService.ts";
import { roomChatId, roomNameFromChatId } from "../services/roomChatProtocol.ts";
import { applyReactionEvent, type ReactionEvent, type ReactionState } from "../services/reactionState";
import { readMessageBookmarks, saveMessageBookmarks, toggleMessageBookmark } from "../services/messageBookmarks.ts";
import { bookmarkId, collectLoadedMedia, copySelectedMessages, findLoadedMessages, forwardContent, isUserMessage } from "../services/messageWorkspace.ts";

type MessageListProps = {
  chatId: string;
  currentUserId: string;
  username: string;
  isPeopleChat: boolean;
  onReply?: (reply: ReplyReference) => void;
  toolsOpen?: boolean;
  onCloseTools?: () => void;
};
type ViewMode = 'all' | 'saved' | 'media';
type MediaFilter = 'all' | 'image' | 'video' | 'file' | 'audio';
type ForwardTarget = {id: string; name: string; kind: 'people' | 'group'};

export default function MessageList({ chatId, currentUserId, username, isPeopleChat, onReply, toolsOpen = false, onCloseTools }: MessageListProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [workspaceSession] = useState(currentSessionSignal);
  const [pending, setPending] = useState<ReactionEvent[]>([]);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const pendingRef = useRef<ReactionEvent[]>([]);
  const pendingSequence = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  // A scroll event caused by our own bottom adjustment must not disable
  // follow mode if an image expands the content before the event fires.
  const expectedScrollTop = useRef<number | null>(null);
  const scrollAnchor = useRef<{id:string;top:number}|null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const messages = useSelector((state: RootState) => state.messages.messages);
  const history = useSelector((state: RootState) => state.messages.historyByChat[chatId]);
  const friends = useSelector((state: RootState) => state.contacts.friends);
  const groups = useSelector((state: RootState) => state.contacts.groups);
  const [view, setView] = useState<ViewMode>('all');
  const [search, setSearch] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [bookmarks, setBookmarks] = useState<string[]>(() => readMessageBookmarks(currentUserId, chatId));
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [forwardIds, setForwardIds] = useState<string[]>([]);
  const [forwardTarget, setForwardTarget] = useState('');
  const [forwardBusy, setForwardBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const chatMessages = useMemo(() => messages.filter(message => message.chatId === chatId)
    .slice().sort((a, b) => parseChatTime(a.orderAt ?? a.createdAt) - parseChatTime(b.orderAt ?? b.createdAt)), [messages, chatId]);
  const visibleMessages = useMemo(() => historyDisplayMessages(chatMessages).filter(isUserMessage), [chatMessages]);
  const library = useMemo(() => collectLoadedMedia(visibleMessages), [visibleMessages]);
  const found = useMemo(() => search.trim() ? findLoadedMessages(visibleMessages, search) : visibleMessages,
    [visibleMessages, search]);
  const shownMessages = view === 'saved' ? found.filter(m => bookmarks.includes(bookmarkId(m))) : found;
  const mediaItems = library.filter(media => mediaFilter === 'all' || media.kind === mediaFilter || (mediaFilter === 'image' && media.kind === 'gif'));
  const bookmarkedCount = visibleMessages.filter(m => bookmarks.includes(bookmarkId(m))).length;
  const selectedMessages = visibleMessages.filter(m => selectedIds.includes(m.id));

  const forwardTargets: ForwardTarget[] = [
    ...friends.filter(friend => friend.id.toLowerCase() !== currentUserId.toLowerCase()).map(friend => ({id:friend.id,name:friend.name,kind:'people' as const})),
    ...groups.map(group => ({id:group.id,name:group.name,kind:'group' as const})),
  ];

  const reactions = useMemo(() => {
    const result: ReactionState = new Map();
    for (const message of chatMessages) {
      const event = parseInteraction(message.content);
      if (event?.kind === 'reaction') {
        applyReactionEvent(result, {targetId:chatMessages.find(row=>row.reconciledLiveId===event.targetId)?.id ?? event.targetId, senderId:message.senderId,
          emoji:event.emoji, operation:event.operation});
      }
    }
    for (const event of pending) applyReactionEvent(result, event);
    return result;
  }, [chatMessages, pending]);
  const latestMessageId = visibleMessages.at(-1)?.id;
  const updatePending = (next: ReactionEvent[]) => { pendingRef.current = next; setPending(next); };

  const reactTo = (targetId: string, emoji: string) => {
    const mine = reactions.get(targetId)?.get(currentUserId.toLowerCase()) ?? new Set<string>();
    const operation: 'add' | 'remove' = mine.has(emoji) ? 'remove' : 'add';
    const event: ReactionEvent = {targetId, senderId:currentUserId, emoji, operation, localId:String(++pendingSequence.current)};
    updatePending([...pendingRef.current, event]);
    setReactionError(null);
    const content = makeReaction(targetId, emoji, operation);
    const session = workspaceSession;
    if (!isCurrentSession(session)) return;
    void (async () => {
      try {
        if (isPeopleChat) {
          const confirmed = await peopleChatService.sendMessage(currentUserId, chatId, content, messages.filter(m=>m.chatId===chatId).map(m=>m.id));
          if (!confirmed) throw new Error('Máy chủ chưa xác nhận cảm xúc.');
          assertCurrentSession(session);
          dispatch(addMessage(confirmed));
        } else {
          const confirmed = await sendRoomMessage(roomNameFromChatId(chatId), content, {knownMessageIds:messages.filter(m=>m.chatId===chatId).map(m=>m.id)});
          assertCurrentSession(session);
          dispatch(addMessage({...confirmed, orderAt:new Date().toISOString()}));
        }
      } catch (error) {
        setReactionError(error instanceof Error ? error.message : 'Không thể đồng bộ cảm xúc.');
      } finally { updatePending(pendingRef.current.filter(item => item.localId !== event.localId)); }
    })();
  };
  const firstPageLoaded = history?.loadedPages.includes(1) ?? false;
  const nextPage = Math.max(0, ...(history?.loadedPages ?? [])) + 1;

  // Exactly one scroll correction after each React commit. Browser scroll
  // anchoring is disabled here because older pages have an explicit anchor.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || view !== 'all' || search.trim()) return;
    const anchor = scrollAnchor.current;
    if (anchor) {
      if (history?.loading) return;
      const node = document.getElementById(anchor.id);
      if (node && list.contains(node)) {
        const delta = node.getBoundingClientRect().top - anchor.top;
        if (Math.abs(delta) > 1) list.scrollTop += delta;
      }
      scrollAnchor.current = null;
      return;
    }
    if (nearBottomRef.current && (firstPageLoaded || latestMessageId)) {
      const bottom = Math.max(0, list.scrollHeight - list.clientHeight);
      if (Math.abs(list.scrollTop - bottom) > 1) {
          list.scrollTop = bottom;
          expectedScrollTop.current = list.scrollTop;
        }
    }
  }, [chatId, firstPageLoaded, latestMessageId, view, search, history?.loading, chatMessages]);

  // Coalesce asynchronous size changes into a single frame, never write to
  // scrollTop from inside ResizeObserver's layout notification itself.
  useEffect(() => {
    const list = listRef.current;
    const body = contentRef.current;
    if (!list || !body || view !== 'all' || search.trim() || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame || !nearBottomRef.current || scrollAnchor.current) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!nearBottomRef.current || scrollAnchor.current) return;
        const bottom = Math.max(0, list.scrollHeight - list.clientHeight);
        if (Math.abs(list.scrollTop - bottom) > 1) {
          list.scrollTop = bottom;
          expectedScrollTop.current = list.scrollTop;
        }
      });
    });
    observer.observe(body);
    observer.observe(list);
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [view, search]);
  const handleHistoryScroll = () => {
    const list = listRef.current;
    if (!list) return;
    if (expectedScrollTop.current !== null && Math.abs(list.scrollTop - expectedScrollTop.current) < 2) {
      expectedScrollTop.current = null;
      return;
    }
    expectedScrollTop.current = null;
    nearBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 64;
  };
  const loadPage = (page: number, force=false) => {
    if (!isCurrentSession(workspaceSession)||history?.loading) return;
    const list=listRef.current;
    if(page>1&&list){
      const top=list.getBoundingClientRect().top;
      const node=Array.from(list.querySelectorAll<HTMLElement>('.message-row')).find(row=>row.getBoundingClientRect().bottom>top);
      if(node){scrollAnchor.current={id:node.id,top:node.getBoundingClientRect().top};nearBottomRef.current=false;}
    }
    void dispatch(isPeopleChat ? fetchPeopleChatHistory({username, chatId, page,force}) : fetchRoomChatHistory({username, chatId, page,force})).then(result=>{
      if(result.meta.requestStatus==='rejected' && 'condition' in result.meta && result.meta.condition)scrollAnchor.current=null;
    });
  };

  const toggleBookmark = (message: ChatMessage) => {
    const updated = toggleMessageBookmark(bookmarks, bookmarkId(message));
    saveMessageBookmarks(currentUserId, chatId, updated);
    setBookmarks(updated);
  };
  const toggleSelection = (id: string) => setSelectedIds(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]);
  const openForward = (ids: string[]) => {
    setForwardIds(ids.slice(0, 10)); setForwardTarget(''); setFeedback('');
  };
  const forwardMessages = async () => {
    const target = forwardTargets.find(item => `${item.kind}:${item.id}` === forwardTarget);
    if (!target || forwardBusy) return;
    const originals = visibleMessages.filter(m => forwardIds.includes(m.id)).slice(0, 10);
    const contents = originals.map(forwardContent);
    if (contents.some(c => !c)) { setFeedback('Có tin không thể chuyển tiếp (quá dài, không hợp lệ hoặc tệp giới hạn quyền theo hội thoại). Hãy tải và gửi lại tệp nếu có quyền.'); return; }
    setForwardBusy(true);
    let completed = 0;
    const session = workspaceSession;
    if (!isCurrentSession(session)) return;
    try {
      for (const content of contents) {
        assertCurrentSession(session);
        if (!content) continue;
        if (target.kind === 'group') {
          const confirmed = await sendRoomMessage(target.name, content, {knownMessageIds:messages.filter(m=>m.chatId===roomChatId(target.name)).map(m=>m.id)});
          assertCurrentSession(session);
          dispatch(addMessage({...confirmed, chatId:roomChatId(target.name), orderAt:new Date().toISOString()}));
        } else {
          const confirmed = await peopleChatService.sendMessage(currentUserId, target.id, content, messages.filter(m=>m.chatId===target.id).map(m=>m.id));
          if (!confirmed) throw new Error('Máy chủ chưa xác nhận chuyển tiếp.');
          assertCurrentSession(session);
          dispatch(addMessage(confirmed));
        }
        completed++;
      }
      setForwardIds([]); setSelectedIds([]); setSelecting(false);
      setFeedback(`Đã chuyển tiếp ${completed} tin đến ${target.name}.`);
    } catch (error) {
      setFeedback(`Đã gửi ${completed}/${contents.length} tin. ${error instanceof Error ? error.message : 'Máy chủ chưa xác nhận.'}`);
      // Giữ hộp thoại và loại bỏ các tin đã được server xác nhận để tránh gửi lại.
      setForwardIds(originals.slice(completed).map(m => m.id));
    } finally { setForwardBusy(false); }
  };
  const copySelected = async () => {
    const text = copySelectedMessages(selectedMessages, currentUserId);
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setFeedback(`Đã sao chép ${selectedMessages.length} tin nhắn.`); }
    catch { setFeedback('Không sao chép được. Hãy kiểm tra quyền clipboard của trình duyệt.'); }
  };
  const jumpTo = (id: string) => {
    nearBottomRef.current = false;
    scrollAnchor.current = null;
    setView('all'); setSearch('');
    window.requestAnimationFrame(() => {
      const list = listRef.current;
      const target = document.getElementById(`lyra-message-${id}`) ?? document.getElementById(`lyra-message-${chatMessages.find(m=>m.reconciledLiveId===id)?.id ?? ''}`);
      if (!list || !target || !list.contains(target)) {setFeedback('Tin gốc chưa có trong lịch sử đã tải. Hãy tải thêm lịch sử.');return;}
      const listRect = list.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      list.scrollTo({
        top: list.scrollTop + targetRect.top - listRect.top - list.clientHeight / 2 + targetRect.height / 2,
        behavior: 'smooth',
      });
    });
  };

  return (
    <div className="lyra-conversation-content">
      <div className="message-list" ref={listRef} onScroll={handleHistoryScroll} role="log" aria-label="Lịch sử tin nhắn">
      <div className="lyra-history-content" ref={contentRef}>
      {feedback && <div className="lyra-workspace-feedback" role="status">{feedback}<button onClick={()=>setFeedback('')} type="button" aria-label="Đóng thông báo">×</button></div>}
      {selecting && <div className="lyra-workspace-selection" role="region" aria-label="Thao tác với tin nhắn đã chọn">
        <span>Đã chọn {selectedIds.length} tin</span>
        <button type="button" onClick={()=>void copySelected()} disabled={!selectedIds.length}>Sao chép</button>
        <button type="button" onClick={()=>openForward(selectedIds)} disabled={!selectedIds.length}>Chuyển tiếp (tối đa 10)</button>
        <button type="button" onClick={()=>{setSelecting(false);setSelectedIds([]);}}>Bỏ chọn</button>
      </div>}
      {reactionError && <div className="history-error" role="alert"><span>Không đồng bộ được cảm xúc: {reactionError}</span><button type="button" onClick={()=>setReactionError(null)}>Đóng</button></div>}
      {history?.hasMore && !history.error && <button className="history-load-more" type="button" onClick={()=>loadPage(nextPage)} disabled={history.loading}>{history.loading && nextPage>1?'Đang tải tin nhắn cũ hơn...':'Tải tin nhắn cũ hơn'}</button>}
      {history?.error && <div className="history-error" role="alert"><span>{history.error}</span><button type="button" onClick={()=>loadPage(history.requestedPage??1,true)} disabled={history.loading}>Thử lại</button></div>}
      {!firstPageLoaded && !history?.error && visibleMessages.length===0 && <p className="empty-messages">Đang tải lịch sử tin nhắn...</p>}
      {view === 'media' && (firstPageLoaded || visibleMessages.length>0) ? <div className="lyra-workspace-gallery">
        {mediaItems.length===0 ? <p className="empty-messages">Không có tệp tương ứng trong lịch sử đã tải.</p> : mediaItems.map(media => {
          const url=resolveLocalMediaUrl(media.url, window.location.origin, Boolean(import.meta.env.DEV && import.meta.env.VITE_LYRA_LOCAL_MEDIA === '1'));
          return <article className="lyra-workspace-media-card" key={`${media.messageId}-${media.index}`}>
          {media.kind==='image'||media.kind==='gif' ? <img src={url} alt={media.name} loading="lazy" referrerPolicy="no-referrer"/> : <i className={`bi bi-${media.kind==='video'?'camera-video':media.kind==='audio'?'mic':'file-earmark-text'}`} aria-hidden="true"/>}
          <strong title={media.name}>{media.name}</strong><small>Gửi bởi {media.sender}</small>
          <div><button type="button" onClick={()=>jumpTo(media.messageId)}>Xem tin</button><a href={url} rel="noopener noreferrer" target="_blank" referrerPolicy="no-referrer">Mở tệp</a></div>
        </article>;})}
      </div> : <>
        {shownMessages.length===0 && firstPageLoaded && !history?.loading && !history?.error && <p className="empty-messages">{view==='saved'?'Chưa có tin nhắn đã lưu trong phần lịch sử đang tải.':search?'Không tìm thấy tin nhắn phù hợp.':'Chưa có tin nhắn. Hãy bắt đầu trò chuyện!'}</p>}
        {shownMessages.map(message => <MessageItem key={`${message.chatId}-${message.id}`}
          message={message} currentUserId={currentUserId}
          reactions={Array.from(reactions.get(message.id)?.values()??[]).flatMap(set=>[...set])}
          currentReactions={[...(reactions.get(message.id)?.get(currentUserId.toLowerCase())??new Set<string>())]}
          onReaction={emoji=>void reactTo(message.id,emoji)}
          onReply={()=>onReply?.({id:message.id,sender:message.senderName??message.senderId,excerpt:mediaMessagePreview(visibleMessageContent(message.content)).slice(0,120)})}
          onJumpReply={jumpTo}
          bookmarked={bookmarks.includes(bookmarkId(message))} onBookmark={()=>toggleBookmark(message)}
          onForward={()=>openForward([message.id])}
          selecting={selecting} selected={selectedIds.includes(message.id)} onSelect={()=>toggleSelection(message.id)}
          highlighted={Boolean(search.trim())}
        />)}
      </>}
      </div>
      </div>
      {toolsOpen && createPortal(<div className={`lyra-tools-modal-backdrop${document.querySelector('.theme-dark') ? ' theme-dark' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) onCloseTools?.(); }}>
        <section className="lyra-tools-dialog" role="dialog" aria-modal="true" aria-label="Công cụ tin nhắn">
          <header className="lyra-tools-dialog-header">
            <strong><i className="bi bi-sliders" aria-hidden="true" /> Công cụ tin nhắn</strong>
            <button type="button" aria-label="Đóng công cụ" onClick={onCloseTools}><i className="bi bi-x-lg" /></button>
          </header>
          <div className="lyra-workspace-expandable">
            <div className="lyra-workspace-tabs">
              <button type="button" className={view==='all'?'is-active':''} onClick={() => { setView('all'); onCloseTools?.(); }}><i className="bi bi-chat-dots"/> Tin nhắn</button>
              <button type="button" className={view==='saved'?'is-active':''} onClick={() => { setView('saved'); onCloseTools?.(); }}><i className="bi bi-bookmark-star"/> Đã lưu ({bookmarkedCount})</button>
              <button type="button" className={view==='media'?'is-active':''} onClick={() => { setView('media'); onCloseTools?.(); }}><i className="bi bi-images"/> Ảnh & tệp ({library.length})</button>
              <button type="button" className={selecting?'is-active':''} onClick={() => { setSelecting(!selecting); setSelectedIds([]); setView('all'); onCloseTools?.(); }}><i className="bi bi-check2-square"/> Chọn nhiều</button>
            </div>
            {view !== 'media' ? <label className="lyra-workspace-search"><i className="bi bi-search" aria-hidden="true"/>
              <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tin nhắn đã tải (hỗ trợ không dấu)..." aria-label="Tìm tin nhắn trong hội thoại" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Xóa tìm kiếm">×</button>}
            </label> : <label className="lyra-workspace-media-filter">Lọc tệp
              <select value={mediaFilter} onChange={event => setMediaFilter(event.target.value as MediaFilter)}>
                <option value="all">Tất cả</option><option value="image">Ảnh & GIF</option><option value="video">Video</option><option value="audio">Ghi âm</option><option value="file">Tệp</option>
              </select>
            </label>}
            <small>Chỉ tìm trong những tin đã tải. Bấm Đóng để xem kết quả.</small>
          </div>
        </section>
      </div>, document.body)}
      {forwardIds.length>0 && <div className="lyra-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!forwardBusy)setForwardIds([]);}}>
        <section className="lyra-workspace-forward-dialog" role="dialog" aria-modal="true" aria-label="Chuyển tiếp tin nhắn">
          <h3>Chuyển tiếp {forwardIds.length} tin nhắn</h3>
          <p>Chọn một người hoặc nhóm trong danh bạ. Chỉ gửi qua API SEND_CHAT của giảng viên.</p>
          <label>Người nhận
            <select value={forwardTarget} disabled={forwardBusy} onChange={e=>setForwardTarget(e.target.value)}>
              <option value="">-- Chọn người hoặc nhóm --</option>
              {forwardTargets.map(t=><option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>{t.kind==='group'?'Nhóm':'Cá nhân'} · {t.name}</option>)}
            </select>
          </label>
          {forwardTargets.length===0 && <small>Danh bạ chưa có người/nhóm để chuyển tiếp. Hãy cập nhật danh bạ trước.</small>}
          {feedback && <div className="lyra-workspace-feedback" role="alert">{feedback}</div>}
          <div className="lyra-workspace-forward-actions"><button type="button" disabled={forwardBusy} onClick={()=>setForwardIds([])}>Hủy</button><button type="button" disabled={!forwardTarget||forwardBusy} onClick={()=>void forwardMessages()}>{forwardBusy?'Đang gửi...':'Xác nhận chuyển tiếp'}</button></div>
        </section>
      </div>}
    </div>
  );
}
