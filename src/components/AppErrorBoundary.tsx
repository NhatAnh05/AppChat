import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

/** Giữ ứng dụng có màn hình báo lỗi thay vì trắng hoàn toàn khi React bị lỗi. */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Không xác định được lỗi.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LyraChat gặp lỗi khi hiển thị:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f3f7f8', padding: 24 }}>
        <section style={{ width: '100%', maxWidth: 520, borderRadius: 18, padding: 30, background: '#fff', boxShadow: '0 8px 32px #163e3614', fontFamily: 'Arial, sans-serif' }}>
          <h1 style={{ color: '#123c36', marginTop: 0 }}>LyraChat không thể hiển thị</h1>
          <p>Một thành phần giao diện vừa gặp lỗi. Bạn có thể tải lại trang hoặc kiểm tra Console (F12).</p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 14, background: '#f0f4f4', borderRadius: 10, fontSize: 12 }}>{this.state.message}</pre>
          <button type="button" onClick={() => window.location.reload()} style={{ background: '#236758', color: 'white', border: 0, borderRadius: 9, padding: '12px 18px', cursor: 'pointer' }}>Tải lại trang</button>
        </section>
      </main>
    );
  }
}
