import {websocketService, type WebSocketMessage,} from "./websocket";

const RESPONSE_TIMEOUT = 10000;


function sendAuthRequest<T>(event: string, data: unknown): Promise<WebSocketMessage<T>> {
    return new Promise((resolve, reject) => {
        const unsubscribeRef = { current: () => {} };

        const timeout = setTimeout(() => {
            unsubscribeRef.current();
            reject(new Error(`Server không phản hồi yêu cầu ${event}`));
        }, RESPONSE_TIMEOUT);

        const unsubscribe = websocketService.on(event, (message) => {
            clearTimeout(timeout);
            unsubscribe();
            resolve(message as WebSocketMessage<T>);
        });

        unsubscribeRef.current = unsubscribe;

        try {
            websocketService.send(event, data);
        } catch (error) {
            clearTimeout(timeout);
            unsubscribe();
            reject(error);
        }
    });
}


export const authService = {
    register(user: string, pass: string) {
        return sendAuthRequest<string>("REGISTER", { user, pass });
    },

    login(user: string, pass: string) {
        return sendAuthRequest<{ RE_LOGIN_CODE: string }>(
            "LOGIN",
            { user, pass }
        );
    },

    reLogin(user: string, code: string) {
        return sendAuthRequest<{ RE_LOGIN_CODE: string }>(
            "RE_LOGIN",
            { user, code }
        );
    },

    logout() {
        return sendAuthRequest<unknown>("LOGOUT", {});
    },
};