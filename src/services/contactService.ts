import {type WebSocketMessage, websocketService} from "./websocket.ts";

export type UserListItem = {
    name: string;
    type: 0 | 1;
    actionTime: string;
};

export const contactService = {
    // lấy danh sách người dùng và nhóm
    getUserList(): Promise<UserListItem[]> {
        return new Promise((resolve, reject) => {
            let unsubscribe = () => {};

            const timeout = setTimeout(() => {
                unsubscribe();
                reject(new Error("Hết thời gian chờ GET_USER_LIST"));
            }, 10000);

            unsubscribe = websocketService.on("GET_USER_LIST",
                (message: WebSocketMessage) => {
                    clearTimeout(timeout);
                    unsubscribe();

                    if (message.status === "error") {
                        reject(new Error(message.mes || "Không thể lấy danh sách"));
                        return;
                    }

                    if (!Array.isArray(message.data)) {
                        reject(new Error("Dữ liệu GET_USER_LIST không hợp lệ"));
                        return;
                    }
                    resolve(message.data as UserListItem[]);
                }
            );

            try {
                websocketService.send("GET_USER_LIST");
            } catch (error) {
                clearTimeout(timeout);
                unsubscribe();
                reject(error);
            }
        });
    },

    /**
     * Lấy danh sách người đã trò chuyện.
     */
    async getFriends(): Promise<UserListItem[]> {
        const items = await this.getUserList();

        return items.filter(item => item.type === 0);
    },

    /**
     * Lấy danh sách nhóm.
     */
    async getGroups(): Promise<UserListItem[]> {
        const items = await this.getUserList();

        return items.filter(item => item.type === 1);
    },
};
