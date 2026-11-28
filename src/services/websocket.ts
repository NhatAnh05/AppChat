import type { RoomHistoryDiagnostic } from './roomChatProtocol.ts';
/** Shared transport: REGISTER before login; every other app API uses the authenticated socket. */
export interface WebSocketMessage<T = unknown> {
    event: string;
    status?: 'success' | 'error';
    data: T;
    mes?: string;
}
export type ApiLogEntry = { at: string; direction: 'GỬI' | 'NHẬN' | 'TRẠNG THÁI'; event: string; status?: string; detail?: string };
export type WebSocketState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
type MessageCallback = (message: WebSocketMessage) => void;
type LogCallback = (entry: ApiLogEntry) => void;
type StatusCallback = (status: WebSocketState) => void;

export const CHAT_WS_URL = (import.meta as ImportMeta & {env?: {VITE_CHAT_WS_URL?: string}}).env?.VITE_CHAT_WS_URL || 'wss://chat.longapp.io.vn/chat/chat';

export class WebSocketService {
    private socket: WebSocket | null = null;
    private authenticated = false;
    private status: WebSocketState = 'DISCONNECTED';
    private connectPromise: Promise<void> | null = null;
    private readonly messages = new Map<string, Set<MessageCallback>>();
    private readonly logs = new Set<LogCallback>();
    private readonly statuses = new Set<StatusCallback>();

    getStatus(): WebSocketState { return this.status; }
    getSocket(): WebSocket | null { return this.socket; }
    isAuthenticated(): boolean { return this.authenticated && this.socket?.readyState === WebSocket.OPEN; }

    /** Only used by registration. Login/RE_LOGIN must authenticate BEFORE calling adopt(). */
    connect(): Promise<void> {
        if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
        if (this.connectPromise) return this.connectPromise;
        this.connectPromise = new Promise<void>((resolve, reject) => {
            let socket: WebSocket;
            try { socket = new WebSocket(CHAT_WS_URL); }
            catch (error) { reject(error); return; }
            this.adopt(socket, false);
            this.updateStatus('CONNECTING');
            let settled = false;
            const finish = (error?: Error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.connectPromise = null;
                if (error) {
                    this.release(socket);
                    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
                    reject(error);
                } else resolve();
            };
            const timer = setTimeout(() => {
                this.release(socket);
                try { socket.close(); } catch { /* closed already */ }
                finish(new Error('Kết nối WebSocket quá thời gian chờ.'));
            }, 10000);
            const originalOpen = socket.onopen;
            socket.onopen = ev => { originalOpen?.call(socket, ev); finish(); };
            const originalError = socket.onerror;
            socket.onerror = ev => { originalError?.call(socket, ev); finish(new Error('Không thể kết nối WebSocket.')); };
            const originalClose = socket.onclose;
            socket.onclose = ev => { originalClose?.call(socket, ev); finish(new Error('WebSocket đã đóng trước khi kết nối.')); };
        });
        return this.connectPromise;
    }

    /** Hand over a backend-authenticated socket from LOGIN/RE_LOGIN. */
    adopt(socket: WebSocket, authenticated = true): void {
        if (this.socket && this.socket !== socket) this.disconnect();
        this.socket = socket;
        this.authenticated = authenticated;
        const previousMessage = socket.onmessage;
        socket.onmessage = ev => {
            previousMessage?.call(socket, ev);
            if (this.socket === socket && typeof ev.data === 'string') this.receive(ev.data);
        };
        const previousClose = socket.onclose;
        socket.onclose = ev => {
            if (this.socket === socket) this.release(socket);
            previousClose?.call(socket, ev);
        };
        const previousError = socket.onerror;
        socket.onerror = ev => {
            if (this.socket === socket) this.updateStatus('ERROR');
            previousError?.call(socket, ev);
        };
        this.updateStatus(socket.readyState === WebSocket.OPEN ? 'CONNECTED' : 'CONNECTING');
    }

    release(socket: WebSocket): void {
        if (this.socket !== socket) return;
        this.socket = null;
        this.authenticated = false;
        this.updateStatus('DISCONNECTED');
    }

    lockAuthenticatedOperations(): void { this.authenticated = false; }

    /** LOGOUT must omit the extra data property. Other events keep the documented envelope. */
    send(event: string, data?: unknown): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('WebSocket chưa kết nối.');
        if (!this.authenticated && event !== 'REGISTER') throw new Error('Cần đăng nhập trước khi gọi API.');
        const payload = event === 'LOGOUT'
            ? { action: 'onchat', data: { event: 'LOGOUT' } }
            : { action: 'onchat', data: { event, data: data ?? {} } };
        this.socket.send(JSON.stringify(payload));
        this.log({ at: new Date().toLocaleTimeString('vi-VN'), direction: 'GỬI', event });
    }

    on(event: string, callback: MessageCallback): () => void {
        let callbacks = this.messages.get(event);
        if (!callbacks) { callbacks = new Set(); this.messages.set(event, callbacks); }
        callbacks.add(callback);
        return () => { callbacks?.delete(callback); if (!callbacks?.size) this.messages.delete(event); };
    }
    /** Fixed diagnostic codes only. Never log usernames, message contents, credentials or URLs. */
    diagnostic(event: 'SEND_CHAT' | 'CHECK_USER_ONLINE' | 'CHECK_USER_EXIST' | 'GET_ROOM_CHAT_MES', detail: 'ack-timeout' | 'ack-incomplete' | 'ack-replay' | 'ack-matched' | 'presence-true' | 'presence-false' | 'probe-invalid' | 'probe-other-user' | 'probe-timeout' | RoomHistoryDiagnostic): void {
        this.log({ at: new Date().toLocaleTimeString('vi-VN'), direction:'TRẠNG THÁI', event, detail });
    }
    onLog(callback: LogCallback): () => void { this.logs.add(callback); return () => { this.logs.delete(callback); }; }
    onStatus(callback: StatusCallback): () => void { this.statuses.add(callback); return () => { this.statuses.delete(callback); }; }

    disconnect(): void {
        const old = this.socket;
        if (!old) { this.updateStatus('DISCONNECTED'); return; }
        this.release(old);
        if (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING) old.close();
    }

    private receive(raw: string): void {
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { return; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        const outer = parsed as Record<string, unknown>;
        const maybeInner = outer.data;
        const packet = typeof outer.event === 'string' ? outer : maybeInner && typeof maybeInner === 'object' && !Array.isArray(maybeInner)
            ? maybeInner as Record<string, unknown> : outer;
        if (typeof packet.event !== 'string') return;
        const status = (packet.status ?? outer.status);
        const message: WebSocketMessage = {
            event: packet.event,
            status: status === 'success' || status === 'error' ? status : undefined,
            data: packet.data,
            mes: typeof packet.mes === 'string' ? packet.mes : typeof outer.mes === 'string' ? outer.mes : undefined,
        };
        this.log({ at: new Date().toLocaleTimeString('vi-VN'), direction: 'NHẬN', event: message.event, status: message.status });
        for (const callback of [...(this.messages.get(message.event) ?? [])]) callback(message);
    }
    private log(entry: ApiLogEntry): void { for (const callback of this.logs) callback(entry); }
    private updateStatus(status: WebSocketState): void {
        if (this.status === status) return;
        this.status = status;
        this.log({ at: new Date().toLocaleTimeString('vi-VN'), direction: 'TRẠNG THÁI', event: status });
        for (const callback of this.statuses) callback(status);
    }
}

export const websocketService = new WebSocketService();
