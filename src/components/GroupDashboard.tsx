import { useMemo, useState } from 'react';
import type { ContactEntry } from '../types/contact.ts';
import {
  filterAndSortGroups,
  makeGroupShareText,
  readableGroupError,
} from '../services/groupManagement.ts';

type GroupDashboardProps = {
  groups: ContactEntry[];
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onJoin: () => void;
  onOpen: (group: ContactEntry) => void;
  onRefresh: () => void;
  onLeave: (name: string) => Promise<void>;
};

/**
 * Trang quản lý nhóm: chỉ danh sách nhóm đã được API trả về / xác nhận.
 * Mọi nút rời nhóm đều phải chờ OUT_ROOM thành công trước khi cập nhật giao diện.
 */
export function GroupDashboard({
  groups,
  loading,
  error,
  onCreate,
  onJoin,
  onOpen,
  onRefresh,
  onLeave,
}: GroupDashboardProps) {
  const [keyword, setKeyword] = useState('');
  const [ascending, setAscending] = useState(true);
  const [confirmRoom, setConfirmRoom] = useState<string | null>(null);
  const [leavingRoom, setLeavingRoom] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const visibleGroups = useMemo(
    () => filterAndSortGroups(groups, keyword, ascending),
    [groups, keyword, ascending],
  );

  const copyRoom = async (roomName: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Trình duyệt chưa hỗ trợ sao chép tự động.');
      }
      await navigator.clipboard.writeText(makeGroupShareText(roomName));
      setFeedback({ type: 'success', text: `Đã sao chép hướng dẫn tham gia nhóm "${roomName}".` });
    } catch (error) {
      setFeedback({ type: 'error', text: readableGroupError(error) });
    }
  };

  const confirmLeave = async () => {
    if (!confirmRoom || leavingRoom) return;
    const name = confirmRoom;
    setLeavingRoom(name);
    setFeedback(null);
    try {
      await onLeave(name);
      setConfirmRoom(null);
      setFeedback({ type: 'success', text: `Bạn đã rời nhóm "${name}".` });
    } catch (error) {
      setFeedback({ type: 'error', text: readableGroupError(error) });
    } finally {
      setLeavingRoom(null);
    }
  };

  return (
    <section className="lyra-group-dashboard" aria-label="Quản lý nhóm trò chuyện">
      <header className="lyra-groups-heading">
        <div>
          <span className="lyra-groups-kicker"><i className="bi bi-people-fill" /> KHÔNG GIAN NHÓM</span>
          <h1>Quản lý nhóm trò chuyện</h1>
          <p>Tạo nhóm mới, tham gia bằng tên phòng và quản lý các nhóm bạn đang tham gia.</p>
        </div>
        <span className="lyra-group-count">{groups.length} nhóm</span>
      </header>

      <div className="lyra-groups-action-grid">
        <button type="button" className="lyra-group-feature-card" onClick={onCreate}>
          <span className="lyra-group-feature-icon"><i className="bi bi-plus-lg" /></span>
          <strong>Tạo nhóm mới</strong>
          <span>Đặt tên phòng và chờ máy chủ xác nhận CREATE_ROOM.</span>
          <span className="lyra-group-feature-cta">Tạo nhóm <i className="bi bi-arrow-right" /></span>
        </button>
        <button type="button" className="lyra-group-feature-card join" onClick={onJoin}>
          <span className="lyra-group-feature-icon"><i className="bi bi-box-arrow-in-right" /></span>
          <strong>Tham gia nhóm</strong>
          <span>Nhập đúng tên phòng được thành viên chia sẻ để gửi JOIN_ROOM.</span>
          <span className="lyra-group-feature-cta">Tham gia <i className="bi bi-arrow-right" /></span>
        </button>
      </div>

      <div className="lyra-groups-list-header">
        <div>
          <h2>Nhóm của tôi</h2>
          <p>Chỉ hiển thị nhóm đã xác nhận qua máy chủ.</p>
        </div>
        <button type="button" className="lyra-groups-refresh" onClick={onRefresh} disabled={loading}>
          <i className={`bi bi-${loading ? 'hourglass-split' : 'arrow-clockwise'}`} />
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      <div className="lyra-groups-toolbar">
        <label className="lyra-groups-search">
          <i className="bi bi-search" />
          <input
            aria-label="Tìm kiếm nhóm theo tên"
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder="Tìm nhóm theo tên..."
          />
          {keyword && <button type="button" aria-label="Xóa tìm kiếm nhóm" onClick={() => setKeyword('')}>×</button>}
        </label>
        <button type="button" className="lyra-groups-sort" onClick={() => setAscending(value => !value)}>
          <i className="bi bi-sort-alpha-down" /> {ascending ? 'A → Z' : 'Z → A'}
        </button>
      </div>

      {error && <p className="lyra-groups-alert" role="alert"><i className="bi bi-exclamation-triangle" /> {error}</p>}
      {feedback && <p className={`lyra-groups-alert ${feedback.type}`} role="status">{feedback.text}</p>}

      {visibleGroups.length === 0 ? (
        <div className="lyra-groups-empty">
          <i className="bi bi-people" />
          <strong>{keyword ? 'Không tìm thấy nhóm phù hợp' : 'Bạn chưa có nhóm nào'}</strong>
          <p>{keyword ? 'Hãy thử từ khóa khác.' : 'Bạn có thể tạo nhóm mới hoặc tham gia bằng tên nhóm được chia sẻ.'}</p>
          {!keyword && <button type="button" onClick={onCreate}>Tạo nhóm đầu tiên</button>}
        </div>
      ) : (
        <div className="lyra-groups-grid">
          {visibleGroups.map(group => (
            <article className="lyra-group-card" key={group.id}>
              <div className="lyra-group-card-main">
                <span className="lyra-group-avatar" aria-hidden="true">{group.initials}</span>
                <div>
                  <h3 title={group.name}>{group.name}</h3>
                  <p><i className="bi bi-chat-dots" /> Nhóm đang tham gia</p>
                </div>
              </div>
              <div className="lyra-group-card-actions">
                <button type="button" className="primary" onClick={() => onOpen(group)}>
                  <i className="bi bi-chat-left-text" /> Mở chat
                </button>
                <button type="button" onClick={() => void copyRoom(group.name)} title="Sao chép cách tham gia">
                  <i className="bi bi-share" /> Chia sẻ
                </button>
                <button type="button" className="danger" onClick={() => { setConfirmRoom(group.name); setFeedback(null); }}>
                  <i className="bi bi-box-arrow-right" /> Rời nhóm
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {confirmRoom && (
        <div className="lyra-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !leavingRoom) setConfirmRoom(null); }}>
          <section className="lyra-modal lyra-group-confirm" role="dialog" aria-modal="true" aria-label="Xác nhận rời nhóm">
            <span className="lyra-group-confirm-icon"><i className="bi bi-box-arrow-right" /></span>
            <h2>Rời nhóm “{confirmRoom}”?</h2>
            <p>Bạn sẽ không còn thấy nhóm trong danh sách khi máy chủ xác nhận rời nhóm. Việc rời nhóm có thể bị từ chối nếu bạn là chủ phòng.</p>
            {feedback?.type === 'error' && <p role="alert" className="lyra-groups-alert error">{feedback.text}</p>}
            <div className="lyra-modal-actions">
              <button type="button" disabled={Boolean(leavingRoom)} onClick={() => setConfirmRoom(null)}>Ở lại nhóm</button>
              <button type="button" className="lyra-confirm-leave-button" disabled={Boolean(leavingRoom)} onClick={() => void confirmLeave()}>
                {leavingRoom ? 'Đang chờ xác nhận...' : 'Xác nhận rời nhóm'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
