import { useState, type FormEvent } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../store/store";
import { authService } from "../services/authService";
import {setCredentials, setLoading, setAuthError, clearAuthError,} from "../features/auth/authSlice";

type LoginResponse = { RE_LOGIN_CODE?: string; };

type LoginProps = { onLogin: (userId: string, reLoginCode: string) => void; onRegister: () => void; };

export function Login({ onLogin, onRegister }: LoginProps) {
  const dispatch = useDispatch<AppDispatch>();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");
    setForgotMessage("");
    dispatch(clearAuthError());

    const user = username.trim();

    if (!user) {
      setError("Vui lòng nhập tài khoản.");
      return;
    }

    if (!password.trim()) {
      setError("Vui lòng nhập mật khẩu.");
      return;
    }

    if (loading) return;

    setIsLoading(true);
    dispatch(setLoading(true));

    try {
      const { websocketService } = await import("../services/websocket");
      await websocketService.connect();

      const response = await authService.login(user, password);

      if (response.status !== "success") {
        throw new Error(response.mes || "Tên đăng nhập hoặc mật khẩu không chính xác.");
      }

      const data = response.data as LoginResponse;
      const code = data?.RE_LOGIN_CODE;

      if (!code) {
        throw new Error("Server không trả về mã phiên đăng nhập.");
      }

      dispatch(setCredentials({userId: user, reLoginCode: code,}));

      onLogin(user, code);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
      setError(message);
      dispatch(setAuthError(message));
    } finally {
      setIsLoading(false);
      dispatch(setLoading(false));
    }
  };

  const handleForgotPassword = () => {
    setShowForgotPassword(true);
    setError("");
    setForgotMessage("");
  };

  const handleSendEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim()) {
      setForgotMessage("Vui lòng nhập địa chỉ email.");
      return;
    }

    setForgotMessage(
        "Chức năng khôi phục mật khẩu hiện chưa được API hỗ trợ."
    );
  };

  return (
      <div className="login-page">
        <form className="login-form" onSubmit={handleSubmit}>
          <h1>LyraChat</h1>
          <p>Đăng nhập để tiếp tục trò chuyện</p>

          <label htmlFor="username">Tài khoản</label>
          <input id="username" type="text" value={username} onChange={(event) =>
                  setUsername(event.target.value)} placeholder="Nhập tên tài khoản" autoComplete="username" required/>

          <label htmlFor="password">Mật khẩu</label>

          <div style={{ position: "relative", width: "100%" }}>
            <input id="password" type={showPassword ? "text" : "password"} value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nhập mật khẩu" autoComplete="current-password" required
                style={{width: "100%", paddingRight: "40px",}}/>

            <span onClick={() => setShowPassword((prev) => !prev)} role="button" tabIndex={0} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setShowPassword((prev) => !prev);
                  }}}
                style={{position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", zIndex: 2, fontSize: "20px", color: "#333",}}>
              <i className={showPassword ? "bi bi-eye-slash" : "bi bi-eye"} />
            </span>
          </div>

          <div className="forgot-password">
            <button type="button" onClick={handleForgotPassword}>
              Quên mật khẩu?
            </button>
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>

          <small>
            Chưa có tài khoản?{" "}
            <button type="button" className="register-back-button" onClick={onRegister}>
              Đăng ký ngay
            </button>
          </small>
        </form>

        {showForgotPassword && (
            <div className="forgot-overlay">
              <form className="forgot-form" onSubmit={handleSendEmail}>
                <h2>Quên mật khẩu?</h2>
                <p>Nhập email của bạn để yêu cầu khôi phục mật khẩu.</p>

                <label htmlFor="email">Địa chỉ email</label>
                <input id="email" type="email" value={email} onChange={(event) =>
                        setEmail(event.target.value)} placeholder="example@gmail.com" required/>

                {forgotMessage && (<p className="forgot-message">{forgotMessage}</p>)}

                <button type="submit">Gửi yêu cầu</button>

                <button type="button" className="cancel-button" onClick={() => {
                      setShowForgotPassword(false);
                      setForgotMessage("");
                    }}>
                  Quay lại đăng nhập
                </button>
              </form>
            </div>
        )}
      </div>
  );
}
