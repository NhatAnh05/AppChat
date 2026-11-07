import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, LockKeyhole, ArrowRight } from 'lucide-react';
import { registerAccount } from '../services/authService';
import { loginAccount, type LoginSession } from '../services/loginService';

type Mode = 'login' | 'register';
type Props = {
  onLogin: (session: LoginSession) => void;
  onDisconnected: () => void;
  notice?: string;
};

/** LOGIN / REGISTER đều gửi WebSocket thật. Chat sử dụng dữ liệu từ WebSocket cấu hình. */
export default function AuthPage({ onLogin, onDisconnected, notice }: Props) {
  const [mode, setMode] = useState<Mode>(() => window.location.pathname === '/register' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onPopState = () => setMode(window.location.pathname === '/register' ? 'register' : 'login');
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      controllerRef.current?.abort();
    };
  }, []);

  function changeMode(next: Mode) {
    if (loading) return;
    setMode(next);
    setError('');
    setSuccess('');
    setPassword('');
    setConfirmPassword('');
    window.history.pushState(null, '', next === 'register' ? '/register' : '/login');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setSuccess('');
    const user = username.trim();
    if (!/^[A-Za-z0-9_]+$/.test(user)) {
      setError('Tên tài khoản chỉ gồm chữ cái không dấu, số và dấu gạch dưới (_).');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      if (mode === 'register') {
        await registerAccount({ username: user, password }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setPassword('');
        setConfirmPassword('');
        setMode('login');
        window.history.replaceState(null, '', '/login');
        setSuccess('Đăng ký thành công trên máy chủ. Hãy đăng nhập bằng tài khoản vừa tạo.');
      } else {
        const session = await loginAccount(
            { username: user, password },
            { signal: controller.signal, onDisconnected },
        );
        if (controller.signal.aborted) return;
        setPassword('');
        onLogin(session);
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Máy chủ không xử lý được yêu cầu.');
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setLoading(false);
    }
  }

  return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo"><MessageCircle size={25} /></div>
          <span className="auth-eyebrow">LYRACHAT · {'API WEBSOCKET GIẢNG VIÊN'}</span>
          <h1>{mode === 'register' ? 'Tạo tài khoản AppChat' : 'Đăng nhập AppChat'}</h1>
          <p>{mode === 'register'
              ? 'Đăng ký tài khoản bằng API REGISTER của máy chủ được cung cấp.'
              : 'Đăng nhập bằng tên tài khoản và mật khẩu đã đăng ký với máy chủ.'}</p>

          <form onSubmit={submit} className="auth-form">
            <label>Tên tài khoản (username)
              <input required autoComplete="username" maxLength={64} pattern="[A-Za-z0-9_]+" title="Chỉ dùng chữ cái không dấu, số và dấu gạch dưới" value={username} disabled={loading} onChange={e => setUsername(e.target.value)} placeholder="Ví dụ: appchat_test_01" />
            </label>
            <label>Mật khẩu
              <input required type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} disabled={loading} onChange={e => setPassword(e.target.value)} placeholder={mode === 'register' ? 'Tạo mật khẩu' : 'Nhập mật khẩu'} />
            </label>
            {mode === 'register' && (
                <label>Xác nhận mật khẩu
                  <input required type="password" autoComplete="new-password" value={confirmPassword} disabled={loading} onChange={e => setConfirmPassword(e.target.value)} placeholder="Nhập lại mật khẩu" />
                </label>
            )}

            {notice && !error && !success && <div className="auth-info" role="status">{notice}</div>}
            {error && <div className="auth-error" role="alert">{error}</div>}
            {success && <div className="auth-success" role="status">{success}</div>}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Đang chờ máy chủ...' : mode === 'register' ? 'Đăng ký' : 'Đăng nhập'}
              {!loading && <ArrowRight size={17} />}
            </button>
          </form>

          <button className="auth-switch" type="button" disabled={loading} onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
          </button>
          <div className="auth-notice"><LockKeyhole size={15} />
            {mode === 'register'
                ? 'Tài khoản được tạo trên máy chủ đang cấu hình. Không dùng mật khẩu cá nhân khi thử nghiệm.'
                : 'Chỉ khi API LOGIN xác nhận thành công mới mở giao diện. Tin nhắn được gửi/lưu tại máy chủ WebSocket đang cấu hình.'}
          </div>
        </div>
      </div>
  );
}
