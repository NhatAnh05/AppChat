import type { ChatMessage } from "../types/chat";
import { websocketService, type WebSocketMessage } from "./websocket";
import { authService } from "./authService";

type ApiPeopleMessage = {
  id: string | number;
  name: string;
  to: string;
  mes: string;
  createAt: string;
  type: number;
};

type ApiSentPeopleMessage = {
  id?: string | number;
  name?: string;
  to?: string;
  mes?: string;
  createAt?: string;
  type?: number;
};

let historyRequestQueue: Promise<void> = Promise.resolve();
let sendRequestQueue: Promise<void> = Promise.resolve();
const RESPONSE_TIMEOUT_MS = 10_000;

class SendConfirmationMissingError extends Error {}

async function ensureAuthenticatedConnection(): Promise<void> {
  const wasConnected = websocketService.getStatus() === "CONNECTED";
  await websocketService.connect();
  if (wasConnected) return;

  const userId = localStorage.getItem("userId");
  const reLoginCode = localStorage.getItem("reLoginCode");
  if (!userId || !reLoginCode) {
    throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  const response = await authService.reLogin(userId, reLoginCode);
  const nextCode = response.data?.RE_LOGIN_CODE;
  if (response.status !== "success" || !nextCode) {
    throw new Error(response.mes ?? "Không thể khôi phục phiên đăng nhập.");
  }
  localStorage.setItem("reLoginCode", nextCode);
}

function mapMessage(message: ApiPeopleMessage, chatId: string): ChatMessage {
  return {
    id: String(message.id),
    chatId,
    senderId: message.name,
    senderName: message.name,
    recipientId: message.to,
    recipientName: message.to,
    content: message.mes,
    createdAt: message.createAt,
    type: message.type,
  };
}

function validateMessages(data: unknown): ApiPeopleMessage[] {
  if (!Array.isArray(data)) throw new Error("Lịch sử tin nhắn không hợp lệ.");

  return data.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Tin nhắn không hợp lệ.");

    const message = item as Partial<ApiPeopleMessage>;
    if (
      (typeof message.id !== "string" && typeof message.id !== "number") ||
      typeof message.name !== "string" ||
      typeof message.to !== "string" ||
      typeof message.mes !== "string" ||
      typeof message.createAt !== "string" ||
      typeof message.type !== "number"
    ) {
      throw new Error("Tin nhắn thiếu dữ liệu.");
    }

    return message as ApiPeopleMessage;
  });
}

function requestHistory(username: string, page: number): Promise<WebSocketMessage> {
  const request = historyRequestQueue.then(() => new Promise<WebSocketMessage>((resolve, reject) => {
    let unsubscribe = () => {};
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      unsubscribe();
      window.clearTimeout(timeout);
    };

    unsubscribe = websocketService.on("GET_PEOPLE_CHAT_MES", (message) => {
      cleanup();
      resolve(message);
    });

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Máy chủ chưa phản hồi."));
    }, RESPONSE_TIMEOUT_MS);

    try {
      websocketService.send("GET_PEOPLE_CHAT_MES", { name: username, page });
    } catch (error) {
      cleanup();
      reject(error);
    }
  }));

  historyRequestQueue = request.then(() => undefined, () => undefined);
  return request;
}

function requestSendMessage(recipient: string, content: string): Promise<WebSocketMessage> {
  const request = sendRequestQueue.then(() => new Promise<WebSocketMessage>((resolve, reject) => {
    let unsubscribeMessage = () => {};
    let unsubscribeStatus = () => {};
    let settled = false;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new SendConfirmationMissingError("Chưa nhận được xác nhận từ máy chủ."));
    }, RESPONSE_TIMEOUT_MS);

    const cleanup = () => {
      if (settled) return;
      settled = true;
      unsubscribeMessage();
      unsubscribeStatus();
      window.clearTimeout(timeout);
    };

    unsubscribeMessage = websocketService.on("SEND_CHAT", (message) => {
      const data = message.data as Partial<ApiSentPeopleMessage> | null;
      if (data?.to && data.to.toLowerCase() !== recipient.toLowerCase()) return;
      if (data?.mes && data.mes !== content) return;

      if (message.status === "error") {
        cleanup();
        reject(new Error(message.mes ?? "Gửi tin nhắn thất bại."));
        return;
      }

      const matchesRequest = message.status === "success" || (data?.to && data?.mes === content);
      if (!matchesRequest) return;

      cleanup();
      resolve(message);
    });

    unsubscribeStatus = websocketService.onStatus((status) => {
      if (status === "ERROR" || status === "DISCONNECTED") {
        cleanup();
        reject(new SendConfirmationMissingError("Mất kết nối khi gửi tin nhắn."));
      }
    });

    try {
      websocketService.send("SEND_CHAT", { type: "people", to: recipient, mes: content });
    } catch {
      cleanup();
      reject(new Error("Mất kết nối. Tin nhắn chưa được gửi."));
    }
  }));

  sendRequestQueue = request.then(() => undefined, () => undefined);
  return request;
}

export const peopleChatService = {
  async getHistory(username: string, page = 1): Promise<ChatMessage[]> {
    if (!username.trim()) throw new Error('Chưa chọn người trò chuyện.');
    const pageNumber = Number.isInteger(page) && page > 0 ? page : 1;

    await ensureAuthenticatedConnection();
    const response = await requestHistory(username, pageNumber);

    if (response.status === "error") {
      const message = response.mes ?? 'Không tải được lịch sử tin nhắn.';
      if (/no (message|history)|không có tin nhắn|chưa có tin nhắn/i.test(message)) {
        return [];
      }
      throw new Error(message);
    }

    const messages = validateMessages(response.data);
    return messages.slice(0, 50).map((message) => mapMessage(message, username));
  },

  async sendMessage(
    sender: string,
    recipient: string,
    content: string,
    knownMessageIds: string[] = [],
  ): Promise<ChatMessage | null> {
    const trimmedContent = content.trim();
    const orderAt = new Date().toISOString();
    if (!trimmedContent) throw new Error("Nhập nội dung tin nhắn.");
    if (!sender.trim() || !recipient.trim()) throw new Error("Thiếu người gửi hoặc người nhận.");

    try {
      await ensureAuthenticatedConnection();
    } catch {
      throw new Error("Không kết nối được máy chủ.");
    }

    let response: WebSocketMessage;
    try {
      response = await requestSendMessage(recipient, trimmedContent);
    } catch (error) {
      if (!(error instanceof SendConfirmationMissingError)) throw error;

      try {
        await ensureAuthenticatedConnection();
        const historyResponse = await requestHistory(recipient, 1);
        if (historyResponse.status === "error") return null;
        const recentHistory = validateMessages(historyResponse.data)
          .slice(0, 50)
          .map((message) => mapMessage(message, recipient));
        const knownIds = new Set(knownMessageIds);
        const confirmedMessage = recentHistory.find((message) => {
          return (
            !knownIds.has(message.id) &&
            message.senderId.toLowerCase() === sender.toLowerCase() &&
            message.recipientId?.toLowerCase() === recipient.toLowerCase() &&
            message.content === trimmedContent
          );
        });

        if (confirmedMessage) return confirmedMessage;
        return null;
      } catch {
        return null;
      }
    }

    const data = response.data as Partial<ApiSentPeopleMessage> | null;
    const hasResponseMessage = Boolean(data && typeof data === "object" && typeof data.mes === "string");
    if (response.status !== "success" && !hasResponseMessage) {
      throw new Error(response.mes ?? "Gửi tin nhắn thất bại.");
    }

    const responseData = data && typeof data === "object" ? data : {};
    const senderName = responseData.name ?? sender;
    const recipientName = responseData.to ?? recipient;

    return {
      id: String(responseData.id ?? crypto.randomUUID()),
      chatId: recipient,
      senderId: senderName,
      senderName,
      recipientId: recipientName,
      recipientName,
      content: responseData.mes ?? trimmedContent,
      createdAt: responseData.createAt ?? new Date().toISOString(),
      orderAt,
      type: responseData.type ?? 0,
    };
  },
};
