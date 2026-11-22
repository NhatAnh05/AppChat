import { websocketService, type WebSocketMessage } from './websocket.ts';
import { loginAccount, restoreLoginSession } from './loginService.ts';
import { logoutCurrentSession } from './logoutService.ts';

/** API #1 REGISTER is the only auth operation permitted on an unauthenticated socket. */
export function registerAccount(user: string, pass: string): Promise<WebSocketMessage<string>> {
    return new Promise((resolve, reject) => {
        let finished = false;
        const cleanup = () => { clearTimeout(timer); stopMessage(); stopStatus(); };
        const finish = (error?: Error, response?: WebSocketMessage<string>) => {
            if (finished) return;
            finished = true;
            cleanup();
            if (error) reject(error); else if (response) resolve(response);
        };
        const stopMessage = websocketService.on('REGISTER', message => {
            if (message.status === 'error') finish(new Error(message.mes ?? 'Đăng ký thất bại.'));
            else if (message.status === 'success') finish(undefined, message as WebSocketMessage<string>);
        });
        const stopStatus = websocketService.onStatus(status => {
            if (status === 'DISCONNECTED' || status === 'ERROR') finish(new Error('Mất kết nối khi đăng ký.'));
        });
        const timer = setTimeout(() => finish(new Error('Máy chủ không phản hồi REGISTER.')), 10000);
        void websocketService.connect().then(() => {
            if (finished) return;
            try { websocketService.send('REGISTER', {user, pass}); }
            catch (error) { finish(error instanceof Error ? error : new Error('Không gửi được REGISTER.')); }
        }).catch(error => finish(error instanceof Error ? error : new Error('Không thể kết nối máy chủ.')));
    });
}

export const authService = {
    register: registerAccount,
    login: (user: string, pass: string) => loginAccount({username:user,password:pass}),
    reLogin: async () => restoreLoginSession(),
    logout: () => logoutCurrentSession(),
};
