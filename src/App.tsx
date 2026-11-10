import { useCallback, useEffect, useState } from 'react';
import { Info, RefreshCw, Wifi, WifiOff, X, ClipboardList } from 'lucide-react';
import { useServerChats } from './hooks/useServerChats';
import { disconnectLoginSession, restoreLoginSession, retryConnectionNow, type LoginSession } from './services/loginService';
import { getChatDiagnostics } from './services/chatSocket';
import { logoutCurrentSession } from './services/logoutService';
import { getConnectionState, subscribeConnectionState } from './services/connectionHealth';
import AuthPage from './pages/AuthPage';
import Rail from './components/Rail';
import Sidebar, { type Filter } from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import DetailsPanel from './components/DetailsPanel';
import AccountSettingsDialog, { readChatSettings, SETTINGS_KEY } from './components/AccountSettingsDialog';
import type { Section } from './components/Rail';

type Modal = 'new' | 'create' | 'join' | 'settings' | 'call' | null;
function LoggedIn({ session, onExit }: {session:LoginSession;onExit:(message?: string)=>void}) {
  const api = useServerChats(session.username);
  useEffect(()=>{
    const invalid=()=>{disconnectLoginSession();onExit();};
    window.addEventListener('lyra:auth-expired',invalid);
    return ()=>window.removeEventListener('lyra:auth-expired',invalid);
  },[onExit]);
  const [section,setSection] = useState<Section>('chats');
  const [filter,setFilter] = useState<Filter>('all');
  const [search,setSearch] = useState('');
  const [selected,setSelected] = useState('');
  const [details,setDetails] = useState(false);
  const [mobileChat,setMobileChat] = useState(false);
  const [modal,setModal] = useState<Modal>(null);
  const [input,setInput] = useState('');
  const [chatSettings,setChatSettings] = useState(readChatSettings);
  const updateChatSettings = (value: typeof chatSettings) => { setChatSettings(value); try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch {/* local storage unavailable */} };
  const [notice,setNotice] = useState('');
  const [loggingOut,setLoggingOut] = useState(false);
  const [connection,setConnection] = useState(getConnectionState);
  const [showDiagnostics,setShowDiagnostics] = useState(false);
  useEffect(()=>subscribeConnectionState(setConnection),[]);
  const chat=api.conversations.find(item=>item.id===selected);
  const roomBlocked=Boolean(chat?.group && api.roomMembership[chat.id]===false);
  const joinSelectedRoom=()=>{if(chat?.group){api.joinRoom(chat.name);setNotice('Đã gửi yêu cầu tham gia phòng. Chờ máy chủ xác nhận.');}};
  useEffect(()=>{ if(selected)api.loadHistory(selected); },[selected]); // Lấy trang đầu khi chọn hội thoại
  const choose=(id:string)=>{setSelected(id);api.markRead(id);setMobileChat(true);setDetails(false);};
  const open=(type:Modal)=>{setModal(type);setInput('');setNotice('');};
  const create=()=>{
    const name=input.trim();if(!name)return;
    if(modal==='new') {if (name===session.username) {setNotice('Không thể tự nhắn tin cho mình.');return;} choose(api.startPerson(name));}
    else if(modal==='create'){api.createRoom(name);api.refresh();setNotice('Đã gửi yêu cầu tạo phòng. Đang cập nhật danh sách từ máy chủ.');return;}
    else if(modal==='join'){api.joinRoom(name);setNotice('Đã gửi yêu cầu tham gia phòng. Chờ máy chủ xác nhận.');return;}
    setModal(null);
  };
  const logout=()=>{
    if (loggingOut) return;
    setLoggingOut(true);
    void logoutCurrentSession().then(result=>{
      onExit(result.backendConfirmed
          ? 'Đã đăng xuất khỏi máy chủ.'
          : 'Đã thoát trên thiết bị. Máy chủ chưa xác nhận LOGOUT.');
    }).catch(()=>{
      disconnectLoginSession();
      onExit('Đã thoát trên thiết bị. Máy chủ chưa xác nhận LOGOUT.');
    });
  };
  return <div className={`app-shell ${mobileChat?'is-mobile-chat':''} ${details?'details-open':''} ${chatSettings.compactChats?'ly-compact-chats':''}`}>
    <Rail active={section} onChange={next=>{setSection(next);setMobileChat(false);setDetails(false);if(next==='chats')setFilter('all');}} onSettings={()=>open('settings')} onGroups={()=>{setSection('chats');setFilter('groups');open('create');}} onCalls={()=>open('call')} accountName={session.username}/>
    <Sidebar messagePreview={chatSettings.messagePreview} conversations={api.conversations} messages={api.messages} section={section} filter={filter} search={search} onFilter={setFilter} onSearch={setSearch} selected={selected} onSelect={choose} onNewChat={()=>open('new')} onShowChat={()=>setMobileChat(true)} onUpdateChat={api.updateConversation} onRemoveChat={()=>{setNotice('API chưa hỗ trợ xóa hội thoại trên máy chủ.');}} />
    <ChatPanel key={`${session.username}:${selected}`} draftNamespace={session.username} canSend={connection==='connected'} chat={chat} roomBlocked={roomBlocked} onJoinRoom={joinSelectedRoom} messages={api.messages[selected]??[]} onSend={value=>api.sendMessage(selected,value)} forwardTargets={api.conversations} onForward={(targetId,value)=>api.sendMessage(targetId,value)} onRetryMessage={messageId=>api.retryMessage(selected,messageId)} onEdit={()=>window.alert('Máy chủ chưa cung cấp API sửa tin nhắn.')} onDelete={()=>window.alert('Máy chủ chưa cung cấp API xóa tin nhắn.')} onBack={()=>setMobileChat(false)} onDetails={()=>setDetails(value=>!value)} onOpenCallPreview={()=>open('call')} onManageGroup={()=>open('join')}/>
    {details && chat && <DetailsPanel chat={chat} onClose={()=>setDetails(false)} onManageGroup={()=>open('join')}/>}
    {(api.error || notice || api.busy) && <div className="api-status" role="status">{api.error || notice || (api.busy?'Đang tải tin nhắn từ máy chủ…':'')} <button type="button" onClick={()=>{api.clearError();setNotice('');}}>×</button></div>}
    <div className="api-toolbar"><span role="status" className={`ly-connection-state ${connection}`} aria-live="polite">{connection==='connected'?<Wifi size={13}/>:<WifiOff size={13}/>} {connection==='connected'?'Đã kết nối API':connection==='reconnecting'?'Đang kết nối lại…':connection==='offline'?'Mất kết nối':connection==='signing-out'?'Đang đăng xuất…':'Chưa đăng nhập'}</span>{(connection==='offline'||connection==='reconnecting') && <button type="button" onClick={()=>retryConnectionNow(()=>window.dispatchEvent(new Event('lyra:auth-expired')))}>Kết nối lại</button>}<button type="button" disabled={connection!=='connected'} onClick={api.refresh}><RefreshCw size={15}/> Làm mới hội thoại</button>{chat?.group && !roomBlocked && <button type="button" onClick={()=>{if(window.confirm(`Rời phòng ${chat.name}?`)){api.outRoom(chat.id);setSelected('');}}}>Rời phòng</button>}{chat && <button type="button" onClick={()=>api.retryHistory(chat.id,1)}>Thử tải lại lịch sử</button>}{chat && api.historyHasMore[chat.id]!==false && <button type="button" disabled={api.busy || connection!=='connected'} onClick={()=>api.loadOlderHistory(chat.id)}>Tải thêm tin nhắn cũ</button>}{roomBlocked && <button type="button" onClick={joinSelectedRoom}>Tham gia phòng này</button>}<button type="button" onClick={()=>setShowDiagnostics(true)}><ClipboardList size={13}/> Nhật ký API</button></div>
    {showDiagnostics && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowDiagnostics(false);}}><div role="dialog" aria-modal="true" aria-label="Nhật ký API" className="modal ly-diagnostics"><div className="modal-heading"><div><span className="eyebrow">CHẨN ĐOÁN WEBSOCKET</span><h2>Nhật ký kết nối API</h2></div><button type="button" className="icon-button" onClick={()=>setShowDiagnostics(false)} aria-label="Đóng"><X size={20}/></button></div><p>Chỉ ghi thời điểm, tên event và trạng thái; không ghi nội dung tin nhắn, mật khẩu hay mã đăng nhập.</p><div className="ly-diagnostics-log">{getChatDiagnostics().slice().reverse().map((entry,i)=><div key={i}><time>{new Date(entry.at).toLocaleTimeString('vi-VN')}</time> {entry.direction==='send'?'GỬI':'NHẬN'} <strong>{entry.event}</strong> <span>{entry.status||'–'}</span></div>)}</div><button className="group-submit" type="button" onClick={()=>void navigator.clipboard?.writeText(getChatDiagnostics().map(entry=>`${new Date(entry.at).toISOString()} ${entry.direction} ${entry.event} ${entry.status||''}`).join('\n'))}>Sao chép nhật ký đã ẩn dữ liệu nhạy cảm</button></div></div>}
    {modal==='settings' && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget && !loggingOut)setModal(null);}}><AccountSettingsDialog username={session.username} settings={chatSettings} onSettingsChange={updateChatSettings} onLogout={logout} loggingOut={loggingOut} onClose={()=>{if(!loggingOut)setModal(null);}}/></div>}
    {modal && modal!=='settings' && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><div className="modal" role="dialog" aria-modal="true" aria-label="Thao tác LyraChat">
      <div className="modal-heading"><div><span className="eyebrow">LYRACHAT / WEBSOCKET</span><h2>{modal==='new'?'Tin nhắn mới':modal==='create'?'Tạo phòng chat':modal==='join'?'Tham gia phòng': 'Cuộc gọi'}</h2></div><button type="button" className="icon-button" onClick={()=>setModal(null)} aria-label="Đóng"><X size={20}/></button></div>
      {(modal==='new'||modal==='create'||modal==='join') && <form onSubmit={e=>{e.preventDefault();create();}} className="group-form"><label className="group-name-field">{modal==='new'?'Tên username người nhận': 'Tên phòng chat'}<input autoFocus required maxLength={80} value={input} onChange={e=>setInput(e.target.value)} placeholder={modal==='new'?'Nhập username đã đăng ký':'Nhập tên phòng theo API'}/></label><p className="modal-hint"><Info size={16}/>{modal==='new'?'Nhập username thật trên server, không dùng tên liên hệ trong dữ liệu mẫu.':modal==='create'?'Người tạo phòng là chủ phòng theo quy định API.':'Bạn phải tham gia phòng trước khi gửi tin trong nhóm.'}</p>{notice && <p role="status">{notice}</p>}<div className="group-form-footer"><button type="button" className="group-cancel" onClick={()=>setModal(null)}>Hủy</button><button type="submit" className="group-submit">{modal==='new'?'Mở hội thoại':modal==='create'?'Tạo phòng':'Tham gia'}</button></div></form>}

      {modal==='call' && <p className="modal-hint">Máy chủ được cung cấp chưa có API gọi thoại/video hoặc WebRTC. Chức năng này chưa khả dụng.</p>}
    </div></div>}
  </div>;
}
export default function App(){
  const [session,setSession]=useState<LoginSession|null>(null);
  const [restoring,setRestoring]=useState(true);
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    let active=true;
    void restoreLoginSession().then(recovered=>{
      if(!active)return;
      if(recovered){setSession(recovered);setNotice('');window.history.replaceState(null,'','/');}
      else if(window.location.pathname!=='/register'){window.history.replaceState(null,'','/login');}
      setRestoring(false);
    }).catch(()=>{if(active){setRestoring(false);setNotice('Không thể khôi phục phiên. Vui lòng đăng nhập lại.');}});
    return ()=>{active=false;};
  },[]);
  const handleExit=useCallback((message?: string)=>{setSession(null);setNotice(message || 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại nếu cần.');window.history.replaceState(null,'','/login');},[]);
  if(restoring)return <div className="auth-page"><div className="auth-card" role="status" aria-live="polite"><h1>AppChat</h1><p>Đang kiểm tra và khôi phục phiên đăng nhập…</p></div></div>;
  if(!session)return <AuthPage notice={notice} onDisconnected={()=>{setSession(null);setNotice('Không thể khôi phục phiên WebSocket. Vui lòng đăng nhập lại.');}} onLogin={value=>{setSession(value);setNotice('');window.history.replaceState(null,'','/');}}/>;
  return <LoggedIn session={session} onExit={handleExit}/>;
}
