import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { fetchPeopleChatHistory, fetchRoomChatHistory } from '../features/messages/messagesSlice'
import type { AppDispatch } from '../store/store'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import type { Chat } from '../types/chat'
import type { ReplyReference } from '../services/messageInteractions'
import { getRoomHistory, leaveRoom } from '../services/roomChatService.ts'
import type { CreatedRoomMember } from '../services/createRoomProtocol.ts'
import { readableGroupError } from '../services/groupManagement.ts'
import { isHistoryUnsupported } from '../services/chatHistoryTransport.ts'
import { normalizeSearch } from '../services/messageWorkspace.ts'
import { HISTORY_REFRESH_MS } from '../services/chatRefreshPolicy.ts'

type ChatWindowProps = {
    chat: Chat | null
    currentUserId: string
    onMessageSent?: () => void
    onRoomLeft?: (name:string) => void
    onCheckPresence?: (username: string) => Promise<boolean | undefined>
    presenceError?: string | null
    presenceChecking?: boolean
}

export default function ChatWindow({chat, currentUserId, onMessageSent, onRoomLeft, onCheckPresence, presenceError, presenceChecking}: ChatWindowProps) {
    const dispatch = useDispatch<AppDispatch>()
    const [detailOpen, setDetailOpen] = useState(false)
    const [toolsOpen, setToolsOpen] = useState(false)
    const [members, setMembers] = useState<CreatedRoomMember[]>([])
    const [memberQuery, setMemberQuery] = useState('')
    const [groupFeedback, setGroupFeedback] = useState('')
    const [mentionRequest, setMentionRequest] = useState<{id:number;text:string}|null>(null)
    const [roomError, setRoomError] = useState('')
    const [leaveBusy, setLeaveBusy] = useState(false)
    const [leaveConfirm, setLeaveConfirm] = useState(false)
    const [membersLoading, setMembersLoading] = useState(false)
    const [replyTo, setReplyTo] = useState<ReplyReference | null>(null)
    const [callMode, setCallMode] = useState<"voice" | "video" | null>(null)

    useEffect(() => {
        if (!chat) return
        void dispatch(chat.kind === 'group' ? fetchRoomChatHistory({username:chat.name,chatId:chat.id,page:1}) : fetchPeopleChatHistory({username: chat.name, chatId: chat.id, page: 1}))
    }, [chat?.id, chat?.kind, chat?.name, dispatch])

    // Nhận tin mới qua SEND_CHAT. Đồng bộ dự phòng chỉ một lần/phút, KHÔNG gọi
    // thêm mỗi lần cửa sổ focus (Edge thường phát sinh rất nhiều focus events).
    useEffect(() => {
        if (!chat) return;
        const refresh = () => {
            if (isHistoryUnsupported(chat.kind === 'group' ? 'room' : 'people') ||
                document.visibilityState !== 'visible' || !navigator.onLine || !document.hasFocus()) return;
            void dispatch(chat.kind === 'group'
                ? fetchRoomChatHistory({username: chat.name, chatId: chat.id, page: 1, force: true})
                : fetchPeopleChatHistory({username: chat.name, chatId: chat.id, page: 1, force: true}));
        };
        const interval = window.setInterval(refresh, HISTORY_REFRESH_MS);
        return () => window.clearInterval(interval);
    }, [chat?.id, chat?.kind, chat?.name, dispatch]);

    const openDetails = async () => {
        setDetailOpen(true);
        setRoomError('');
        setMembers([]);
        setMemberQuery('');
        setGroupFeedback('');
        setLeaveConfirm(false);
        if (chat?.kind === 'group') {
            setMembersLoading(true);
            try {
                const {room} = await getRoomHistory(chat.name, 1);
                setMembers(room.user);
            } catch (error) {
                setRoomError(readableGroupError(error));
            } finally {
                setMembersLoading(false);
            }
        }
    };
    const copyGroupName = async () => {
        if (!chat || chat.kind !== 'group') return;
        try {
            await navigator.clipboard.writeText(chat.name);
            setGroupFeedback('Đã sao chép tên nhóm. Người khác có thể nhập tên này ở mục Tham gia nhóm.');
        } catch {
            setGroupFeedback('Không sao chép được. Bạn có thể chọn và sao chép tên phòng ở phía trên.');
        }
    };
    const filteredMembers = members.filter(member => normalizeSearch(member.name).includes(normalizeSearch(memberQuery)));
    const handleLeave = async () => {
        if (!chat || chat.kind !== 'group' || leaveBusy || !leaveConfirm) return;
        setLeaveBusy(true);
        setRoomError('');
        try {
            await leaveRoom(chat.name);
            setDetailOpen(false);
            setLeaveConfirm(false);
            onRoomLeft?.(chat.name);
        } catch (error) {
            setRoomError(readableGroupError(error));
        } finally {
            setLeaveBusy(false);
        }
    };

    if (!chat) {
        return (<main className="chat-window chat-window-empty">
                <div className="empty-chat">
                    <div className="empty-chat-icon"><i className="bi bi-send" /></div>
                    <h2>Tin nhắn của bạn</h2>
                    <p>Chọn một cuộc trò chuyện, hoặc tạo hội thoại bằng username thật.</p>
                    <p className="empty-security"><i className="bi bi-lock" /> Tin nhắn và phòng chat kết nối WebSocket của giảng viên.</p>
                </div>
            </main>
        )
    }

    return (<main className="chat-window">
            <header className="chat-window-header">
                <div className="chat-avatar" style={{ backgroundColor: chat.avatarColor }}>
                    {chat.avatar}
                    {chat.kind !== 'group' && chat.online === true && <i className="online-dot" />}
                </div>

                <div className="chat-header-info">
                    <h2>{chat.name}</h2>
                    <span>{chat.kind === 'group' ? 'Nhóm trò chuyện' : chat.online === true ? 'Đang hoạt động' : chat.online === false ? 'Ngoại tuyến' : 'Chưa rõ trạng thái'}</span>
                    {chat.kind === 'people' && presenceError && <small role="status" title={presenceError} style={{color:'#b45309',fontSize:'11px'}}>Không kiểm tra được: {presenceError}</small>}
                </div>
                <div className="chat-header-actions">
                    <button type="button" className="chat-tools-trigger" title="Công cụ tin nhắn" aria-label="Mở công cụ tin nhắn" aria-expanded={toolsOpen} onClick={() => setToolsOpen(old => !old)}><i className="bi bi-sliders" /> <span>Công cụ</span></button>
                    {chat.kind === 'people' && <button type="button" aria-label="Kiểm tra trạng thái hoạt động" title="Kiểm tra online ngay và xem lỗi nếu API không phản hồi" disabled={presenceChecking} onClick={() => void onCheckPresence?.(chat.id)}><i className={`bi bi-${presenceChecking ? 'hourglass-split' : 'arrow-clockwise'}`} /></button>}
                    <button type="button" title="Gọi thoại" aria-label="Gọi thoại" onClick={() => setCallMode("voice")}><i className="bi bi-telephone" /></button>
                    <button type="button" title="Gọi video" aria-label="Gọi video" onClick={() => setCallMode("video")}><i className="bi bi-camera-video" /></button>
                    <button type="button" className="chat-profile-btn" onClick={() => { void openDetails(); }}><i className="bi bi-person-circle" /> <span>{chat.kind === "group" ? "Thông tin nhóm" : "Xem trang cá nhân"}</span></button>
                </div>
            </header>

            {detailOpen && <div className="lyra-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setDetailOpen(false) }}>
                <section className="lyra-detail-card" role="dialog" aria-modal="true" aria-label={chat.kind === "group" ? "Thông tin nhóm" : "Thông tin trang cá nhân"}>
                    <button className="lyra-icon-close" onClick={() => setDetailOpen(false)} aria-label="Đóng"><i className="bi bi-x-lg" /></button>
                    <div className="lyra-detail-cover" />
                    <div className="lyra-detail-avatar" style={{background:chat.avatarColor}}>{chat.avatar}</div>
                    <h2>{chat.name}</h2><span className="lyra-detail-status">{chat.kind === "group" ? "Nhóm trò chuyện" : chat.online === true ? "Đang hoạt động" : chat.online === false ? "Ngoại tuyến" : "Chưa rõ trạng thái"}</span>
                    <div className="lyra-detail-info"><i className="bi bi-at" /><div><small>{chat.kind === "group" ? "Tên phòng" : "Tên tài khoản"}</small><strong>{chat.name}</strong></div></div>
                    <div className="lyra-detail-info"><i className="bi bi-shield-check" /><div><small>Thông tin tài khoản</small><span>Hồ sơ chỉ hiển thị dữ liệu máy chủ cung cấp</span></div></div>
                    {chat.kind === 'group' && <section className="lyra-group-members">
                        <div className="lyra-group-detail-heading">
                            <h3>Thành viên {membersLoading ? '' : `(${members.length})`}</h3>
                            <button type="button" disabled={membersLoading} onClick={() => { void openDetails(); }}>
                                <i className="bi bi-arrow-clockwise" /> Làm mới
                            </button>
                        </div>
                        {membersLoading && <p className="lyra-small-note" role="status">Đang tải thành viên từ máy chủ...</p>}
                        {!membersLoading && !roomError && members.length === 0 && <p className="lyra-small-note">Chưa có dữ liệu thành viên.</p>}
                        <div className="lyra-group-invitation">
                            <button type="button" onClick={() => {void copyGroupName();}}><i className="bi bi-clipboard" /> Sao chép tên nhóm để mời</button>
                            <small>Mời bằng tên phòng có sẵn của API, không tạo link hoặc API thêm người giả.</small>
                        </div>
                        {groupFeedback && <p className="lyra-small-note" role="status">{groupFeedback}</p>}
                        <label className="lyra-group-member-search"><i className="bi bi-search" aria-hidden="true" />
                            <input type="search" value={memberQuery} onChange={event => setMemberQuery(event.target.value)} placeholder="Tìm thành viên..." aria-label="Tìm thành viên nhóm" />
                        </label>
                        <div className="lyra-group-member-list">
                            {filteredMembers.map(member => <div key={member.id} className="lyra-group-member">
                                <span className="lyra-group-member-avatar">{member.name.slice(0, 2).toUpperCase()}</span>
                                <span>{member.name}</span>
                                <button type="button" className="lyra-group-mention" title={`Nhắc ${member.name} trong tin nhắn`} onClick={() => {
                                    setMentionRequest({id:Date.now(), text:`@${member.name} `});
                                    setDetailOpen(false);
                                }}><i className="bi bi-at" /> Nhắc tên</button>
                            </div>)}
                        </div>
                        {!membersLoading && !roomError && members.length > 0 && filteredMembers.length === 0 && <p className="lyra-small-note">Không tìm thấy thành viên.</p>}
                        {roomError && <p role="alert" className="login-error">{roomError}</p>}
                        {!leaveConfirm ? (
                            <button type="button" className="lyra-group-leave-trigger" onClick={() => { setRoomError(''); setLeaveConfirm(true); }}>
                                <i className="bi bi-box-arrow-right" /> Rời nhóm
                            </button>
                        ) : (
                            <div className="lyra-group-leave-confirm">
                                <strong>Bạn chắc chắn muốn rời nhóm?</strong>
                                <p>Chỉ xóa nhóm khỏi danh sách nếu máy chủ xác nhận OUT_ROOM thành công.</p>
                                <div>
                                    <button type="button" disabled={leaveBusy} onClick={() => { setLeaveConfirm(false); setRoomError(''); }}>Hủy</button>
                                    <button type="button" disabled={leaveBusy} onClick={() => { void handleLeave(); }}>
                                        {leaveBusy ? 'Đang rời nhóm...' : 'Xác nhận rời nhóm'}
                                    </button>
                                </div>
                            </div>
                        )}
                        <p className="lyra-small-note">Nếu bạn là chủ phòng, máy chủ có thể từ chối yêu cầu rời nhóm.</p>
                    </section>}
                    <button className="lyra-main-action" onClick={() => setDetailOpen(false)}><i className="bi bi-chat-dots" /> Quay lại trò chuyện</button>
                </section>
            </div>}
            {callMode && <div className="lyra-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setCallMode(null) }}>
                <section className="lyra-call-card" role="dialog" aria-modal="true" aria-label="Thông tin cuộc gọi">
                    <button className="lyra-icon-close" onClick={() => setCallMode(null)} aria-label="Đóng"><i className="bi bi-x-lg" /></button>
                    <div className="lyra-call-symbol"><i className={`bi bi-${callMode === "video" ? "camera-video" : "telephone"}`} /></div>
                    <h2>{callMode === "video" ? "Gọi video" : "Gọi thoại"}</h2>
                    <p>Cuộc gọi đến <strong>{chat.name}</strong> chưa thể bắt đầu. API hiện tại chưa cung cấp tín hiệu thiết lập cuộc gọi WebRTC.</p>
                    <button className="lyra-main-action" onClick={() => setCallMode(null)}>Đã hiểu</button>
                </section>
            </div>}

            <MessageList
                key={`${currentUserId}:${chat.id}`}
                chatId={chat.id}
                currentUserId={currentUserId}
                username={chat.name}
                isPeopleChat={chat.kind === 'people'}
                onReply={setReplyTo}
                toolsOpen={toolsOpen}
                onCloseTools={() => setToolsOpen(false)}
            />

            <MessageInput
                key={`${currentUserId}:${chat.id}`}
                chatId={chat.id}
                currentUserId={currentUserId}
                isGroup={chat.kind === 'group'}
                replyTo={replyTo}
                mentionRequest={mentionRequest}
                onCancelReply={() => setReplyTo(null)}
                onMessageSent={onMessageSent}
            />
        </main>
    )
}
