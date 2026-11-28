import { currentSessionSignal, assertCurrentSession } from './sessionScope.ts';
import type { ChatMessage } from "../types/chat.ts";
import { websocketService, type WebSocketMessage } from "./websocket.ts";
import { ensureLoginConnection, getAuthenticatedUsername } from "./loginService.ts";
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


const acknowledgedIds = new WeakMap<WebSocket, Set<string>>();
const RESPONSE_TIMEOUT_MS = 10_000;

class SendConfirmationMissingError extends Error {}
import { ensureCorrelatedConnection, quarantineResponse, UnconfirmedSendError } from './requestCorrelation.ts';
export { UnconfirmedSendError } from './requestCorrelation.ts';


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
        ![0,"0","people"].includes(message.type as number|string)
    ) {
      throw new Error("Tin nhắn thiếu dữ liệu.");
    }

    return {...message,type:0} as ApiPeopleMessage;
  });
}

function requestHistory(username: string, page: number, signal?: AbortSignal): Promise<WebSocketMessage> {
  // Theo API giảng viên, người và phòng dùng chung CHAT_PEOPLE_GET_MES.
  // Hàng đợi chung ngăn phản hồi của nhóm bị gán nhầm cho chat cá nhân.
  return requestChatHistory(username,page,'people',RESPONSE_TIMEOUT_MS,signal);
}

function requestSendMessage(sender: string, recipient: string, content: string, session: AbortSignal, knownIds: Set<string>): Promise<WebSocketMessage> {
  assertCurrentSession(session);
  const socket = websocketService.getSocket();
  return new Promise<WebSocketMessage>((resolve, reject) => {
    let unsubscribeMessage = () => {};
    let unsubscribeStatus = () => {};
    let settled = false;
    const timeout = setTimeout(() => {
      quarantineResponse(socket,'send');
      cleanup();
      reject(new SendConfirmationMissingError("Chưa nhận được xác nhận từ máy chủ."));
    }, RESPONSE_TIMEOUT_MS);

    const cleanup = () => {
      if (settled) return;
      settled = true;
      unsubscribeMessage();
      unsubscribeStatus();
      session.removeEventListener("abort", onAbort);
      clearTimeout(timeout);
    };

    const onAbort = () => { cleanup(); reject(new Error("Phiên đăng nhập đã thay đổi.")); };
    session.addEventListener("abort", onAbort, {once:true});
    unsubscribeMessage = websocketService.on("SEND_CHAT", (message) => {
      if (session.aborted || websocketService.getSocket() !== socket) { onAbort(); return; }
      const data = message.data as Partial<ApiSentPeopleMessage> | null;
      // SEND_CHAT dùng chung cho chat nhóm và chat cá nhân. Không xác nhận từ
      // một broadcast nhóm, tin của người khác hoặc một ACK success chung chung.
      if (data?.type === 1 || data?.type === '1' || data?.type === 'room') return;
      if (message.status === "error") {
        cleanup();
        reject(new Error(message.mes ?? "Gửi tin nhắn thất bại."));
        return;
      }
      if (message.status !== "success") return;
      if (!data || typeof data.to !== 'string' || typeof data.mes !== 'string') return;
      if (data.to.trim().toLowerCase() !== recipient.trim().toLowerCase()) return;
      if (data.mes !== content) return;
      if (typeof data.name !== 'string' || data.name.trim().toLowerCase() !== sender.trim().toLowerCase()) return;
      if (data.id !== undefined && socket) {
        const id = String(data.id);
        const seen = acknowledgedIds.get(socket) ?? new Set<string>();
        if (knownIds.has(id) || seen.has(id)) return;
        seen.add(id); acknowledgedIds.set(socket, seen);
      }
      cleanup();
      resolve(message);
    });

    unsubscribeStatus = websocketService.onStatus((status) => {
      if (status === "ERROR" || status === "DISCONNECTED") {
        quarantineResponse(socket,'send');
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
  });
}

export const peopleChatService = {
  async getHistory(username: string, page = 1, signal?: AbortSignal): Promise<ChatMessage[]> {
    if (!username.trim()) throw new Error('Chưa chọn người trò chuyện.');
    const pageNumber = Number.isInteger(page) && page > 0 ? page : 1;

    const session = currentSessionSignal();
    await ensureLoginConnection(session);
    assertCurrentSession(session);
    const response = await requestHistory(username, pageNumber, signal);
    assertCurrentSession(session);

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
      knownMessageIds: string[] = [], // reject replayed known server IDs
  ): Promise<ChatMessage | null> {
    const trimmedContent = content.trim();
    const transportContent = encodeChatContent(trimmedContent);
    const orderAt = new Date().toISOString();
    if (!trimmedContent) throw new Error("Nhập nội dung tin nhắn.");
    if (!sender.trim() || !recipient.trim()) throw new Error("Thiếu người gửi hoặc người nhận.");

    const session = currentSessionSignal();
    let response: WebSocketMessage;
    try {
      response = await enqueueChatSend(async queuedSession => {
        assertCurrentSession(session);
        await ensureCorrelatedConnection(queuedSession,'send');
        assertCurrentSession(session);
        const user = getAuthenticatedUsername();
        if (!user || user.trim().toLowerCase() !== sender.trim().toLowerCase()) throw new Error('Người gửi không thuộc phiên hiện tại.');
        return requestSendMessage(sender, recipient, transportContent, session, new Set(knownMessageIds));
      });
      assertCurrentSession(session);
    } catch (error) {
      if (!(error instanceof SendConfirmationMissingError)) throw error;
      // No request ID in the teacher API: even a new matching history row is not
      // proof of this particular send (another tab or delayed send may match).
      throw new UnconfirmedSendError('Máy chủ chưa xác nhận lần gửi này. Tin có thể đã được lưu; kiểm tra lịch sử trước khi gửi lại.', {cause:error});
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
      id: String(responseData.id ?? `ack:${crypto.randomUUID()}`),
      chatId: recipient,
      senderId: senderName,
      senderName,
      recipientId: recipientName,
      recipientName,
      content: decodeChatContent(responseData.mes ?? transportContent),
      createdAt: responseData.createAt ?? new Date().toISOString(),
      orderAt,
      sendStatus: 'confirmed',
      type: typeof responseData.type === "number" ? responseData.type : 0,
    };
  },
};
