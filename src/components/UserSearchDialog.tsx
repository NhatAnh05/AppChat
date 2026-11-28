import { useEffect, useRef, useState } from "react";
import { userService } from "../services/userService";
import { currentSessionSignal, isCurrentSession } from "../services/sessionScope";

type FoundUser = { username: string; displayName: string };

export function UserSearchDialog({ username, onClose, onOpenUser }: { username: string; onClose: () => void; onOpenUser: (username: string) => void }) {
  const [result, setResult] = useState<FoundUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const session = currentSessionSignal();
    const isActive = () => requestId === requestIdRef.current && isCurrentSession(session);
    const search = async () => {
      setResult(null);
      setNotFound(false);
      setError("");
      setLoading(true);
      try {
        const exists = await userService.checkUserExist(username.trim());
        if (!isActive()) return;
        if (exists) setResult({ username: username.trim(), displayName: username.trim() });
        else setNotFound(true);
      } catch (searchError) {
        if (isActive()) setError(searchError instanceof Error ? searchError.message : "Không thể tìm kiếm người dùng.");
      } finally {
        if (isActive()) setLoading(false);
      }
    };
    void search();
    return () => { requestIdRef.current += 1; };
  }, [username]);

  return <section className="user-search-dialog" aria-label="K&#7871;t qu&#7843; t&#236;m username" aria-live="polite">
    <div className="user-search-header">
      <div><h2>K&#7871;t qu&#7843; t&#236;m ki&#7871;m</h2><p>Username: @{username}</p></div>
      <button className="user-search-close" type="button" onClick={onClose} aria-label="&#272;&#243;ng">&#215;</button>
    </div>
    <div className="user-search-feedback">
      {loading && <p className="user-search-loading"><span className="user-search-spinner" /> &#272;ang t&#236;m username...</p>}
      {error && <p className="user-search-error">{error}</p>}
      {notFound && <p className="user-search-not-found">Kh&#244;ng t&#236;m th&#7845;y ng&#432;&#7901;i d&#249;ng n&#224;y.</p>}
      {result && <button className="user-search-result" type="button" onClick={() => onOpenUser(result.username)} aria-label={`Mở cuộc trò chuyện với ${result.displayName}`}>
        <span className="user-search-avatar">{result.username.slice(0, 2).toUpperCase()}</span>
        <span><strong>{result.displayName}</strong><small>@{result.username}</small></span>
      </button>}
    </div>
  </section>;
}
