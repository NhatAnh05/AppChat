import { ensureLoginConnection } from "./loginService.ts";
import { websocketService, type WebSocketMessage } from "./websocket.ts";
import { withApiProbeGate } from "./apiProbeGate.ts";
import { parseUserExistResponse, USER_EXIST_REQUEST_EVENT, USER_EXIST_RESPONSE_EVENT } from "./userExistProtocol.ts";



// Phản hồi kiểm tra online không có requestId/username: chỉ gửi một yêu cầu mỗi lần.
let pendingCheck: Promise<unknown> = Promise.resolve();
// Runtime API evidence: CHECK_USER_ONLINE succeeds while
// CHAT_CHECK_USER_ONLINE produces ACTION_NOT_EXIT on this deployment.
let onlineProtocol: 'documented' | 'alternate' | 'unsupported' = 'alternate';
let checkedSocket: WebSocket | null = null;
const UNSUPPORTED_MESSAGE = 'Máy chủ hiện không hỗ trợ API kiểm tra Online/Offline (ACTION_NOT_EXIT).';

function serializedCheck<T>(operation: () => Promise<T>): Promise<T> {
    const result = pendingCheck.catch(() => undefined).then(() => withApiProbeGate(operation));
    pendingCheck = result.catch(() => undefined);
    return result;
}

function checkResponse(requestEvent: string, responseEvent: string, username: string): Promise<boolean> {
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
            if (message.status === 'error') {
                finish(new Error(message.mes || `${responseEvent} thất bại.`));
                return;
            }
            const value = parseUserExistResponse(message.data);
            if (value === null) {
                finish(new Error(`Phản hồi ${responseEvent} không hợp lệ (thiếu data.status boolean).`));
                return;
            }
            finish(undefined, value);
        };
        cleanups.push(websocketService.on(responseEvent, onResponse));
        if (requestEvent !== responseEvent) cleanups.push(websocketService.on(requestEvent, onResponse));
        // ACTION_NOT_EXIT là phản hồi từ chối ngay của server, không phải timeout.
        cleanups.push(websocketService.on('ACTION_NOT_EXIT', () => {
            finish(new Error('ACTION_NOT_EXIT'));
        }));
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
}

async function checkUserOnline(username: string): Promise<boolean> {
    if (onlineProtocol === 'unsupported' && checkedSocket === websocketService.getSocket()) {
        throw new Error(UNSUPPORTED_MESSAGE);
    }
    return serializedCheck(async () => {
        await ensureLoginConnection();
        const socket = websocketService.getSocket();
        if (checkedSocket !== socket) {
            checkedSocket = socket;
            onlineProtocol = 'alternate';
        }
        if (onlineProtocol === 'unsupported') throw new Error(UNSUPPORTED_MESSAGE);

        // Prefer the event observed to work with the live teacher server.
        // The documented event remains the fallback for other deployments.
        if (onlineProtocol === 'alternate') {
            try {
                return await checkResponse('CHECK_USER_ONLINE', 'CHECK_USER_ONLINE', username);
            } catch (error) {
                if (!(error instanceof Error) || error.message !== 'ACTION_NOT_EXIT') throw error;
                onlineProtocol = 'documented';
            }
        }
        try {
            return await checkResponse('CHAT_CHECK_USER_ONLINE', 'CHECK_USER_ONLINE', username);
        } catch (error) {
            if (error instanceof Error && error.message === 'ACTION_NOT_EXIT') {
                onlineProtocol = 'unsupported';
                throw new Error(UNSUPPORTED_MESSAGE);
            }
            throw error;
        }
    });
}

export const userService = {
    checkUserExist(username: string): Promise<boolean> {
        return serializedCheck(async () => {
            await ensureLoginConnection();
            return checkResponse(USER_EXIST_REQUEST_EVENT, USER_EXIST_RESPONSE_EVENT, username.trim());
        });
    },
    checkUserOnline,
    isOnlineCheckUnsupported(): boolean {
        return onlineProtocol === 'unsupported' && checkedSocket === websocketService.getSocket();
    },
};
