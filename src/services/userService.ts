import { websocketService, type WebSocketMessage } from "./websocket";

type UserCheckResponse = {
    status: boolean;
};

function sendRequest<T>(event: string, data: unknown,): Promise<WebSocketMessage<T>> {
    return new Promise((resolve, reject) => {
        let unsubscribe: () => void = () => {};

        const timeout = setTimeout(() => {
            unsubscribe();
            reject(new Error(`Máy chủ không phản hồi sự kiện ${event}.`));
        }, 10000);

        unsubscribe = websocketService.on(event, (message) => {
            clearTimeout(timeout);
            unsubscribe();

            if (message.status === "error") {
                reject(new Error(message.mes || `${event} thất bại.`));
                return;
            }

            resolve(message as WebSocketMessage<T>);
        });

        try {
            websocketService.send(event, data);
        } catch (error) {
            clearTimeout(timeout);
            unsubscribe();
            reject(error);
        }
    });
}

export const userService = {
    async checkUserExist(username: string): Promise<boolean> {
        const response = await sendRequest<UserCheckResponse>(
            "CHECK_USER_EXIST",
            { user: username },
        );

        return response.data?.status === true;
    },

    async checkUserOnline(username: string): Promise<boolean> {
        const response = await sendRequest<UserCheckResponse>(
            "CHECK_USER_ONLINE",
            { user: username },
        );

        return response.data?.status === true;
    },
};
