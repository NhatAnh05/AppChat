import { sessionQueue, currentSessionSignal, assertCurrentSession } from './sessionScope.ts';
import { ensureCorrelatedConnection, quarantineResponse } from './requestCorrelation.ts';
import { preferExcelApi } from './apiCompatibility.ts';
import { websocketService, type WebSocketMessage } from "./websocket.ts";
import { withApiProbeGate } from "./apiProbeGate.ts";


type UserCheckResponse = { status?: unknown; user?:unknown; username?:unknown };

// Phản hồi kiểm tra online không có requestId/username: chỉ gửi một yêu cầu mỗi lần.
const pendingCheck = sessionQueue();
// Runtime API evidence: CHECK_USER_ONLINE succeeds while
// CHAT_CHECK_USER_ONLINE produces ACTION_NOT_EXIT on this deployment.
let onlineProtocol: 'documented' | 'alternate' | 'unsupported' = 'alternate';
let checkedSocket: WebSocket | null = null;
const UNSUPPORTED_MESSAGE = 'Máy chủ hiện không hỗ trợ API kiểm tra Online/Offline (ACTION_NOT_EXIT).';

function serializedCheck<T>(operation: () => Promise<T>): Promise<T> {
    return pendingCheck(session => withApiProbeGate(() => {assertCurrentSession(session);return operation();}));
}

function checkResponse(requestEvent: string, responseEvent: string, username: string): Promise<boolean> {
    const session=currentSessionSignal();
    const socket = websocketService.getSocket();
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
            if (websocketService.getSocket() !== socket || session.aborted) return;
            if (message.status === 'error') {
                finish(new Error(message.mes || `${responseEvent} thất bại.`));
                return;
            }
            const data = message.data as UserCheckResponse | undefined;
            const identity=data?.user??data?.username;
            if(typeof identity==='string' && identity.trim().toLowerCase()!==username.trim().toLowerCase())return;
            if (typeof data?.status !== 'boolean') {
                finish(new Error(`Phản hồi ${responseEvent} không hợp lệ.`));
                return;
            }
            finish(undefined, data.status);
        };
        cleanups.push(websocketService.on(responseEvent, onResponse));
        if (requestEvent !== responseEvent) cleanups.push(websocketService.on(requestEvent, onResponse));
        // ACTION_NOT_EXIT là phản hồi từ chối ngay của server, không phải timeout.
        cleanups.push(websocketService.on('ACTION_NOT_EXIT', () => {
            finish(new Error('ACTION_NOT_EXIT'));
        }));
        cleanups.push(websocketService.onStatus(status => {
            if (status === 'DISCONNECTED' || status === 'ERROR') {
                quarantineResponse(socket,'probe');
                finish(new Error('Mất kết nối khi kiểm tra trạng thái người dùng.'));
            }
        }));
        const abort=()=>finish(new Error('Phiên đăng nhập đã thay đổi.'));
        session.addEventListener('abort',abort,{once:true});
        cleanups.push(()=>session.removeEventListener('abort',abort));
        const timer = setTimeout(() => { quarantineResponse(socket,'probe'); finish(new Error(`Máy chủ không phản hồi ${responseEvent}.`)); }, 4000);
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
        const session=currentSessionSignal();
        await ensureCorrelatedConnection(session,'probe');
        assertCurrentSession(session);
        const socket = websocketService.getSocket();
        if (checkedSocket !== socket) {
            checkedSocket = socket;
            onlineProtocol = preferExcelApi() ? 'documented' : 'alternate';
        }
        if (onlineProtocol === 'unsupported') throw new Error(UNSUPPORTED_MESSAGE);

        const candidates = onlineProtocol === 'documented' ? ['documented','alternate'] as const : ['alternate','documented'] as const;
        for (const candidate of candidates) {
            assertCurrentSession(session);
            try {
                const result = await checkResponse(candidate === 'documented' ? 'CHAT_CHECK_USER_ONLINE' : 'CHECK_USER_ONLINE', 'CHECK_USER_ONLINE', username);
                onlineProtocol = candidate;
                return result;
            } catch (error) {
                if (!(error instanceof Error) || error.message !== 'ACTION_NOT_EXIT') throw error;
            }
        }
        onlineProtocol = 'unsupported';
        throw new Error(UNSUPPORTED_MESSAGE);
    });
}

export const userService = {
    checkUserExist(username: string): Promise<boolean> {
        return serializedCheck(async () => {
            const session=currentSessionSignal();
            await ensureCorrelatedConnection(session,'probe');
            assertCurrentSession(session);
            return checkResponse('CHAT_CHECK_USER_EXIST', 'CHECK_USER_EXIST', username);
        });
    },
    checkUserOnline,
    isOnlineCheckUnsupported(): boolean {
        return onlineProtocol === 'unsupported' && checkedSocket === websocketService.getSocket();
    },
};
