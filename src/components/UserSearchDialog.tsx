import { useEffect, useRef, useState } from "react";
import { websocketService, type WebSocketMessage } from "../services/websocket";

type FoundUser = { username: string; displayName: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function parseExistence(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === 0) return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLocaleLowerCase();
    if (["true", "1", "yes", "exists", "found"].includes(normalized)) return true;
    if (["false", "0", "no", "not found", "not exist", "not_exists"].includes(normalized)) return false;
  }
  return undefined;
}

function parseCheckUserResponse(message: WebSocketMessage, requestedUsername: string): FoundUser | null {
  if (typeof message.data === "boolean") {
    return message.data ? { username: requestedUsername, displayName: requestedUsername } : null;
  }

  const data = asRecord(message.data);
  const nestedUser = asRecord(data.user);
  const exists = parseExistence(data.exists ?? data.userExists ?? data.user_exist ?? data.isExist ?? data.result ?? data.user);
  const username = firstString(data.username, data.user_name, typeof data.user === "string" ? data.user : undefined, nestedUser.username, nestedUser.user_name);
  const displayName = firstString(data.displayName, data.display_name, data.name, nestedUser.displayName, nestedUser.name);
  const errorText = normalize(`${message.mes ?? ""} ${String(data.message ?? "")}`);
  const notFoundPattern = /not\s*found|not\s*exist|does\s*not\s*exist|doesn'?t\s*exist|khong\s*ton\s*tai|khong\s*tim\s*thay/;

  if (notFoundPattern.test(errorText)) return null;

  if (exists === false) return null;
  if (exists === true) {
    return { username: username ?? requestedUsername, displayName: displayName ?? username ?? requestedUsername };
  }
  // CHECK_USER_EXIST can return only the matching username when the user exists.
  if (username && normalize(username) === normalize(requestedUsername)) {
    return { username, displayName: displayName ?? username };
  }

  if (typeof message.data === "string") {
    const responseText = normalize(message.data);
    if (notFoundPattern.test(responseText)) return null;
    if (responseText === normalize(requestedUsername)) {
      return { username: requestedUsername, displayName: requestedUsername };
    }
    if (["true", "1"].includes(responseText) || /\b(exists?|found)\b/.test(responseText)) {
      return { username: requestedUsername, displayName: requestedUsername };
    }
  }

  if (message.status === "error") {
    throw new Error(firstString(message.mes, data.message) ?? "User lookup failed.");
  }

  if (message.status === "success" && (!message.data || (typeof message.data === "object" && Object.keys(data).length === 0))) {
    return null;
  }

  throw new Error("Máy chủ phản hồi tìm kiếm nhưng không có dữ liệu xác nhận tài khoản tồn tại.");
}

export function UserSearchDialog({ username, onClose, onOpenUser }: { username: string; onClose: () => void; onOpenUser: (username: string) => void }) {
  const [result, setResult] = useState<FoundUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);
  const cleanupRequestRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    const search = async () => {
      try {
        await websocketService.connect();
        if (requestId !== requestIdRef.current) return;

        const response = await new Promise<WebSocketMessage>((resolve, reject) => {
          let unsubscribe = () => {};
          let settled = false;

          const cleanup = () => {
            if (settled) return;
            settled = true;
            unsubscribe();
            window.clearTimeout(timeoutId);
            cleanupRequestRef.current = null;
          };

          unsubscribe = websocketService.on("CHECK_USER_EXIST", (message) => {
            cleanup();
            resolve(message);
          });
          const timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error("Quá thời gian chờ phản hồi. Vui lòng thử lại."));
          }, 10000);
          cleanupRequestRef.current = () => {
            cleanup();
            reject(new Error("Search cancelled."));
          };

          try {
            websocketService.send("CHECK_USER_EXIST", { user: username });
          } catch (sendError) {
            cleanup();
            reject(sendError);
          }
        });

        if (requestId !== requestIdRef.current) return;
        const foundUser = parseCheckUserResponse(response, username);
        if (foundUser) setResult(foundUser);
        else setNotFound(true);
      } catch (searchError) {
        if (requestId !== requestIdRef.current) return;
        setError(searchError instanceof Error ? searchError.message : "Could not search for this user.");
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    };

    void search();
    return () => {
      requestIdRef.current += 1;
      cleanupRequestRef.current?.();
    };
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
