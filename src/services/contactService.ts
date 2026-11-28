import { currentSessionSignal, assertCurrentSession } from './sessionScope.ts';
import { websocketService } from './websocket.ts';
import { ensureCorrelatedConnection, quarantineResponse, enqueueAuthenticatedRequest } from './requestCorrelation.ts';

export type UserListItem = {name: string; type: 0 | 1; actionTime: string};

export function parseUserList(payload: unknown): UserListItem[] | null {
    if (!Array.isArray(payload)) return null;
    const result: UserListItem[] = [];
    for (const item of payload) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const row = item as Record<string, unknown>;
        if (typeof row.name !== 'string' || !row.name.trim() || (row.type !== 0 && row.type !== 1)) return null;
        result.push({name:row.name.trim(),type:row.type,actionTime:typeof row.actionTime === 'string' ? row.actionTime : ''});
    }
    return result;
}

let pendingList: Promise<UserListItem[]> | null = null;
let pendingSession: AbortSignal | undefined;
async function requestList(): Promise<UserListItem[]> {
    const session=currentSessionSignal();
    await ensureCorrelatedConnection(session,'contacts');
    assertCurrentSession(session);
    const socket=websocketService.getSocket();
    return new Promise<UserListItem[]>((resolve, reject) => {
        let finished = false;
        const cleanup = () => { clearTimeout(timeout); offMessage(); offStatus(); session.removeEventListener('abort',abort); };
        const finish = (error?: Error, data?: UserListItem[]) => {
            if (finished) return;
            finished = true; cleanup();
            if (error) reject(error); else resolve(data ?? []);
        };
        const offMessage = websocketService.on('GET_USER_LIST', message => {
            if (message.status === 'error') { finish(new Error(message.mes || 'GET_USER_LIST bị từ chối.')); return; }
            const list = parseUserList(message.data);
            if (!list) { finish(new Error('Dữ liệu GET_USER_LIST không hợp lệ.')); return; }
            finish(undefined, list);
        });
        const offStatus = websocketService.onStatus(status => {
            if (status === 'DISCONNECTED' || status === 'ERROR') {quarantineResponse(socket,'contacts');finish(new Error('Mất kết nối khi tải danh bạ.'));}
        });
        const abort=()=>finish(new Error('Phiên đăng nhập đã thay đổi.'));
        session.addEventListener('abort',abort,{once:true});
        const timeout = setTimeout(() => {quarantineResponse(socket,'contacts');finish(new Error('Hết thời gian chờ GET_USER_LIST.'));}, 10000);
        try { websocketService.send('GET_USER_LIST', {}); }
        catch(error) { finish(error instanceof Error ? error : new Error('Không thể gửi GET_USER_LIST.')); }
    });
}

export const contactService = {
    getUserList(): Promise<UserListItem[]> {
        const session=currentSessionSignal();
        if (pendingList && pendingSession===session) return pendingList;
        pendingSession=session;
        const task = enqueueAuthenticatedRequest(() => requestList());
        pendingList = task;
        void task.finally(() => { if (pendingList === task) pendingList = null; }).catch(() => undefined);
        return task;
    },
    async getFriends() { return (await this.getUserList()).filter(item => item.type === 0); },
    async getGroups() { return (await this.getUserList()).filter(item => item.type === 1); },
};
