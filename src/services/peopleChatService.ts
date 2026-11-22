import type { ChatMessage } from "../types/chat.ts";
import { websocketService, type WebSocketMessage } from "./websocket.ts";
import { ensureLoginConnection } from "./loginService.ts";
import { encodeChatContent, decodeChatContent } from "./chatContentCodec.ts";
import { requestChatHistory } from "./chatHistoryTransport.ts";
import { enqueueChatSend } from "./chatSendQueue.ts";

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
  type?: number | string;
};

let sendRequestQueue: Promise<void> = Promise.resolve();
const RESPONSE_TIMEOUT_MS = 10_000;

class SendConfirmationMissingError extends Error {}

async function ensureAuthenticatedConnection(): Promise<void> {
  await ensureLoginConnection();
}

function mapMessage(message: ApiPeopleMessage, chatId: string): ChatMessage {
  return {
    id: String(message.id),
    chatId,
    senderId: message.name,
    senderName: message.name,
    recipientId: message.to,
    recipientName: message.to,
    content: decodeChatContent(message.mes),
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
  // Theo API giảng viên, người và phòng dùng chung CHAT_PEOPLE_GET_MES.
  // Hàng đợi chung ngăn phản hồi của nhóm bị gán nhầm cho chat cá nhân.
  return requestChatHistory(username,page,'people',RESPONSE_TIMEOUT_MS);
}

function requestSendMessage(sender: string, recipient: string, content: string): Promise<WebSocketMessage> {
  const request = sendRequestQueue.catch(() => undefined).then(() => new Promise<WebSocketMessage>((resolve, reject) => {
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
      // SEND_CHAT dùng chung cho chat nhóm và chat cá nhân. Không xác nhận từ
      // một broadcast nhóm, tin của người khác hoặc một ACK success chung chung.
      if (data?.type === 1 || data?.type === 'room') return;
      if (message.status === "error") {
        cleanup();
        reject(new Error(message.mes ?? "Gửi tin nhắn thất bại."));
        return;
      }
      if (message.status !== "success") return;
      if (!data || typeof data.to !== 'string' || typeof data.mes !== 'string') return;
      if (data.to.trim().toLowerCase() !== recipient.trim().toLowerCase()) return;
      if (data.mes !== content) return;
      if (typeof data.name === 'string' && data.name.trim().toLowerCase() !== sender.trim().toLowerCase()) return;
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
    const transportContent = encodeChatContent(trimmedContent);
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
      response = await enqueueChatSend(() => requestSendMessage(sender, recipient, transportContent));
    } catch (error) {
      if (!(error instanceof SendConfirmationMissingError)) throw error;

      try {
        await ensureAuthenticatedConnection();
        const knownIds = new Set(knownMessageIds);
        // Some deployments do not emit a SEND_CHAT acknowledgment. Verify the
        // actual server history, allowing a short delay for asynchronous writes.
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(resolve => window.setTimeout(resolve, 1200 * attempt));
          const historyResponse = await requestHistory(recipient, 1);
          if (historyResponse.status === "error") continue;
          const recentHistory = validateMessages(historyResponse.data)
              .slice(0, 50)
              .map(message => mapMessage(message, recipient));
          const confirmedMessage = recentHistory.find(message =>
              !knownIds.has(message.id) &&
              message.senderId.toLowerCase() === sender.toLowerCase() &&
              message.recipientId?.toLowerCase() === recipient.toLowerCase() &&
              message.content === trimmedContent
          );
          if (confirmedMessage) return confirmedMessage;
        }
        throw new Error("Máy chủ chưa xác nhận hoặc chưa lưu tin nhắn chứa emoji. Chữ thường gửi được nhưng nội dung mã hóa chưa được server phản hồi. Hãy mở Nhật ký API để kiểm tra SEND_CHAT và CHAT_PEOPLE_GET_MES; không gửi lại liên tục để tránh trùng tin.", { cause: error });
      } catch (historyError) {
        throw historyError instanceof Error ? historyError : new Error("Không xác minh được trạng thái gửi tin.");
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
      content: decodeChatContent(responseData.mes ?? transportContent),
      createdAt: responseData.createAt ?? new Date().toISOString(),
      orderAt,
      type: typeof responseData.type === "number" ? responseData.type : 0,
    };
  },
};
