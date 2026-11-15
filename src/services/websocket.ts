export interface WebSocketMessage<T = unknown> {
    event: string;
    status?: "success" | "error";
    data: T;
    mes?: string;
}

type MessageCallback = (message: WebSocketMessage) => void;
export type ApiLogEntry = { at: string; direction: "GỬI" | "NHẬN" | "TRẠNG THÁI"; event: string; status?: string };
type LogCallback = (entry: ApiLogEntry) => void;
type StatusCallback = (status: WebSocketState) => void;

export type WebSocketState = | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

class WebSocketService {
    private socket: WebSocket | null = null;
    private status: WebSocketState = "DISCONNECTED";
    private messageListeners = new Map<string, Set<MessageCallback>>();
    private logListeners = new Set<LogCallback>();
    private statusListeners = new Set<StatusCallback>();

    private readonly url = 'wss://chat.longapp.io.vn/chat/chat';
    getStatus(): WebSocketState {
        return this.status;
    }

    connect(): Promise<void> {
        if (this.socket?.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }

        if (this.socket?.readyState === WebSocket.CONNECTING) {
            return new Promise((resolve, reject) => {
                const unsubscribe = this.onStatus((status) => {
                    if (status === 'CONNECTED') {
                        unsubscribe();
                        resolve();
                    }

                    if (status === 'ERROR' || status === 'DISCONNECTED') {
                        unsubscribe();
                        reject(new Error('Không thể kết nối WebSocket'));
                    }
                });
            });
        }

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.url);
            this.socket = ws;

            this.notifyStatus('CONNECTING');

            ws.onopen = () => {
                this.notifyStatus('CONNECTED');
                resolve();
            };

            ws.onmessage = (event: MessageEvent<string>) => {
                try {
                    const raw = JSON.parse(event.data);

                    const message = raw?.data?.event ? raw.data : raw;

                    if (typeof message.event !== "string") {
                        console.warn("WebSocket response không hợp lệ:", raw);
                        return;
                    }

                    this.notifyLog({ at: new Date().toLocaleTimeString("vi-VN"), direction: "NHẬN", event: message.event, status: raw.status ?? message.status });
                    this.notifyMessage({
                        event: message.event,
                        status: raw.status ?? message.status,
                        data: message.data,
                        mes: raw.mes ?? message.mes,
                    });
                } catch (error) {
                    console.error('Lỗi đọc WebSocket message:', error);
                }
            };

            ws.onerror = () => {
                this.notifyStatus('ERROR');
                reject(new Error('WebSocket connection error'));
            };

            ws.onclose = () => {
                this.notifyStatus('DISCONNECTED');
                this.socket = null;
            };
        });
    }

    send(event: string, data: unknown = {}): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket chưa kết nối');
        }

        const request = {
            action: 'onchat',
            data: {
                event,
                data,
            },
        };

        this.socket.send(JSON.stringify(request));
        this.notifyLog({at: new Date().toLocaleTimeString("vi-VN"), direction: "GỬI", event});
    }

    on(event: string, callback: MessageCallback): () => void {
        if (!this.messageListeners.has(event)) {
            this.messageListeners.set(event, new Set());
        }

        this.messageListeners.get(event)!.add(callback);

        return () => {this.messageListeners.get(event)?.delete(callback);};
    }

    onLog(callback: LogCallback): () => void {
        this.logListeners.add(callback);
        return () => { this.logListeners.delete(callback); };
    }

    private notifyLog(entry: ApiLogEntry): void {
        this.logListeners.forEach(listener => listener(entry));
    }

    onStatus(callback: StatusCallback): () => void {
        this.statusListeners.add(callback);

        return () => {this.statusListeners.delete(callback);};
    }

    private notifyMessage(message: WebSocketMessage): void {
        this.messageListeners.get(message.event)?.forEach((callback) => {
            callback(message);
        });
    }

    private notifyStatus(status: WebSocketState): void {
        this.status = status;
        this.notifyLog({ at: new Date().toLocaleTimeString("vi-VN"), direction: "TRẠNG THÁI", event: status });
        this.statusListeners.forEach((callback) => callback(status));
    }

    disconnect(): void {
        this.socket?.close();
        this.socket = null;
    }
}

export const websocketService = new WebSocketService();
