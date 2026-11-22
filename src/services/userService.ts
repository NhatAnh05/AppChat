import { ensureLoginConnection } from "./loginService.ts";
import { websocketService, type WebSocketMessage } from "./websocket";

type UserCheckResponse = { status: boolean };

// The teacher API uses CHAT_CHECK_* for requests and CHECK_* for responses.
// Replies contain no request id or username. Serialize requests to avoid
// attributing a reply for user A to user B when checks overlap.
let pendingCheck: Promise<unknown> = Promise.resolve();

function serializedCheck<T>(operation: () => Promise<T>): Promise<T> {
    const result = pendingCheck.catch(() => undefined).then(operation);
    pendingCheck = result.catch(() => undefined);
    return result;
}

function sendCheck(requestEvent: string, responseEvent: string, username: string): Promise<boolean> {
    return serializedCheck(async () => {
        await ensureLoginConnection();
        return new Promise<boolean>((resolve, reject) => {
            let settled = false;
            const cleanups: Array<() => void> = [];
            const finish = (error?: Error, result?: boolean) => {
                if (settled) return;
                settled = true;
                cleanups.forEach(cleanup => cleanup());
                if (error) reject(error);
                else resolve(result === true);
            };
            const onResponse = (message: WebSocketMessage) => {
                if (message.status === "error") {
                    finish(new Error(message.mes || `${responseEvent} thất bại.`));
                    return;
                }
                const data = message.data as UserCheckResponse | undefined;
                // Do not interpret malformed or missing data as an offline user.
                if (typeof data?.status !== "boolean") {
                    finish(new Error(`Phản hồi ${responseEvent} không hợp lệ.`));
                    return;
                }
                finish(undefined, data.status);
            };
            cleanups.push(websocketService.on(responseEvent, onResponse));
            if (requestEvent !== responseEvent) {
                cleanups.push(websocketService.on(requestEvent, onResponse));
            }
            cleanups.push(websocketService.onStatus(status => {
                if (status === 'DISCONNECTED' || status === 'ERROR') {
                    finish(new Error('Mất kết nối khi kiểm tra trạng thái người dùng.'));
                }
            }));
            const timer = setTimeout(() => finish(new Error(`Máy chủ không phản hồi ${responseEvent}.`)), 4000);
            cleanups.push(() => clearTimeout(timer));
            try { websocketService.send(requestEvent, { user: username }); }
            catch (error) { finish(error instanceof Error ? error : new Error('Không gửi được yêu cầu.')); }
        });
    });
}

export const userService = {
    checkUserExist(username: string): Promise<boolean> {
        return sendCheck('CHAT_CHECK_USER_EXIST', 'CHECK_USER_EXIST', username);
    },
    checkUserOnline(username: string): Promise<boolean> {
        return sendCheck('CHAT_CHECK_USER_ONLINE', 'CHECK_USER_ONLINE', username);
    },
};
