import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ChatMessage } from "../../types/chat";
import { peopleChatService } from "../../services/peopleChatService.ts";
import { parseChatTime } from "../../utils/chatTime.ts";
import { getRoomHistory } from "../../services/roomChatService.ts";

type ConversationHistoryState = {
  requestId?: string;
  loading: boolean;
  error: string | null;
  loadedPages: number[];
  hasMore: boolean;
};

interface MessagesState {
  messages: ChatMessage[];
  historyByChat: Record<string, ConversationHistoryState>;
}

type FetchHistoryArgs = { username: string; chatId: string; page?: number; force?: boolean };
type FetchHistoryResult = { chatId: string; page: number; messages: ChatMessage[] };

export const fetchPeopleChatHistory = createAsyncThunk<
    FetchHistoryResult,
    FetchHistoryArgs,
    { rejectValue: string }
>("messages/fetchPeopleChatHistory", async ({ username, chatId, page = 1 }, { rejectWithValue }) => {
  try {
    const messages = await peopleChatService.getHistory(username, page);
    return { chatId, page, messages };
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : "Không thể tải lịch sử tin nhắn.");
  }
}, {
  condition: ({ chatId, page = 1, force = false }, { getState }) => {
    const state = getState() as { messages: MessagesState };
    const history = state.messages.historyByChat[chatId];
    return !history?.loading && (force || !history?.loadedPages.includes(page));
  },
});

export const fetchRoomChatHistory = createAsyncThunk<
    FetchHistoryResult, FetchHistoryArgs, {rejectValue:string}
>('messages/fetchRoomChatHistory', async ({username,chatId,page=1},{rejectWithValue})=>{
  try { const result = await getRoomHistory(username,page); return {chatId,page,messages:result.messages}; }
  catch(error){return rejectWithValue(error instanceof Error?error.message:'Không tải được lịch sử nhóm.');}
},{
  condition:({chatId,page=1,force=false},{getState})=>{
    const state=getState() as {messages:MessagesState};
    const history=state.messages.historyByChat[chatId];
    return !history?.loading && (force||!history?.loadedPages.includes(page));
  }
});

const initialState: MessagesState = {
  messages: [],
  historyByChat: {},
};

const messagesSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {
    resetMessages: () => initialState,
    addMessage: (state, action: PayloadAction<ChatMessage>) => {
      const alreadyAdded = state.messages.some(
          (message) =>
              message.chatId === action.payload.chatId &&
              message.id === action.payload.id &&
              message.senderId === action.payload.senderId &&
              message.recipientId === action.payload.recipientId &&
              message.content === action.payload.content &&
              message.createdAt === action.payload.createdAt,
      );
      if (!alreadyAdded) state.messages.push(action.payload);
    },
    replaceMessage: (state, action: PayloadAction<{ id: string; message: ChatMessage }>) => {
      const chatId = action.payload.message.chatId;
      const optimisticIndex = state.messages.findIndex(
          (message) => message.chatId === chatId && message.id === action.payload.id,
      );
      if (optimisticIndex < 0) return;

      const confirmedIndex = state.messages.findIndex(
          (message) => message.chatId === chatId && message.id === action.payload.message.id,
      );
      if (confirmedIndex >= 0 && confirmedIndex !== optimisticIndex) {
        state.messages.splice(optimisticIndex, 1);
        return;
      }
      state.messages[optimisticIndex] = action.payload.message;
    },
    removeMessage: (state, action: PayloadAction<{ chatId: string; id: string }>) => {
      state.messages = state.messages.filter(
          (message) => message.chatId !== action.payload.chatId || message.id !== action.payload.id,
      );
    },
    importLocalMessages: (state, action: PayloadAction<ChatMessage[]>) => {
      for (const item of action.payload) {
        if (!state.messages.some(m => m.id === item.id && m.chatId === item.chatId)) state.messages.push(item);
      }
    },
    clearConversationMessages: (state, action: PayloadAction<string>) => {
      state.messages = state.messages.filter(message => message.chatId !== action.payload);
      delete state.historyByChat[action.payload];
    },
    invalidateHistory: (state) => {
      for (const history of Object.values(state.historyByChat)) history.loadedPages = [];
    },
    deleteMessage: (state, action: PayloadAction<string>) => {
      state.messages = state.messages.filter((message) => message.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
        .addCase(fetchPeopleChatHistory.pending, (state, action) => {
          const chatId = action.meta.arg.chatId;
          const history = state.historyByChat[chatId] ?? {
            loading: false,
            error: null,
            loadedPages: [],
            hasMore: false,
          };
          history.requestId = action.meta.requestId;
          history.loading = true;
          history.error = null;
          state.historyByChat[chatId] = history;
        })
        .addCase(fetchPeopleChatHistory.fulfilled, (state, action) => {
          const { chatId, page, messages } = action.payload;
          if (state.historyByChat[chatId]?.requestId !== action.meta.requestId) return;
          const history = state.historyByChat[chatId] ?? {
            loading: false,
            error: null,
            loadedPages: [],
            hasMore: false,
          };
          state.historyByChat[chatId] = history;

          if (page === 1) {
            const currentMessages = state.messages.filter((message) => message.chatId === chatId);
            const loadedIds = new Set(messages.map((message) => message.id));
            // Group broadcasts often have no server ID. On history refresh, match
            // provisional live messages to the authoritative server record once.
            const consumed = new Set<string>();
            const realtimeMessages = currentMessages.filter(message => {
              if (!message.orderAt || loadedIds.has(message.id)) return false;
              if (message.type !== 1 || !message.id.startsWith('live:')) return true;
              const match = messages.find(authoritative => {
                if (consumed.has(authoritative.id) || authoritative.type !== 1) return false;
                if (authoritative.senderId.toLowerCase() !== message.senderId.toLowerCase() || authoritative.content !== message.content) return false;
                const a = parseChatTime(authoritative.createdAt);
                const b = parseChatTime(message.createdAt);
                return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 5 * 60_000;
              });
              if (match) { consumed.add(match.id); return false; }
              return true;
            });
            state.messages = state.messages.filter((message) => message.chatId !== chatId);
            state.messages.push(...messages);
            state.messages.push(...realtimeMessages);
          } else {
            const existingIds = new Set(state.messages.filter((message) => message.chatId === chatId).map((message) => message.id));
            state.messages.push(...messages.filter((message) => !existingIds.has(message.id)));
          }

          history.loading = false;
          history.error = null;
          if (!history.loadedPages.includes(page)) history.loadedPages.push(page);
          history.loadedPages.sort((a, b) => a - b);
          history.hasMore = messages.length === 50;
        })
        .addCase(fetchPeopleChatHistory.rejected, (state, action) => {
          const chatId = action.meta.arg.chatId;
          const history = state.historyByChat[chatId];
          if (!history || history.requestId !== action.meta.requestId) return;
          history.loading = false;
          history.error = action.payload ?? action.error.message ?? "Không thể tải lịch sử tin nhắn.";
        })
        .addCase(fetchRoomChatHistory.pending, (state, action) => {
          const chatId = action.meta.arg.chatId;
          const history = state.historyByChat[chatId] ?? {
            loading: false,
            error: null,
            loadedPages: [],
            hasMore: false,
          };
          history.requestId = action.meta.requestId;
          history.loading = true;
          history.error = null;
          state.historyByChat[chatId] = history;
        })
        .addCase(fetchRoomChatHistory.fulfilled, (state, action) => {
          const { chatId, page, messages } = action.payload;
          if (state.historyByChat[chatId]?.requestId !== action.meta.requestId) return;
          const history = state.historyByChat[chatId] ?? {
            loading: false,
            error: null,
            loadedPages: [],
            hasMore: false,
          };
          state.historyByChat[chatId] = history;

          if (page === 1) {
            const currentMessages = state.messages.filter((message) => message.chatId === chatId);
            const loadedIds = new Set(messages.map((message) => message.id));
            // Group broadcasts often have no server ID. On history refresh, match
            // provisional live messages to the authoritative server record once.
            const consumed = new Set<string>();
            const realtimeMessages = currentMessages.filter(message => {
              if (!message.orderAt || loadedIds.has(message.id)) return false;
              if (message.type !== 1 || !message.id.startsWith('live:')) return true;
              const match = messages.find(authoritative => {
                if (consumed.has(authoritative.id) || authoritative.type !== 1) return false;
                if (authoritative.senderId.toLowerCase() !== message.senderId.toLowerCase() || authoritative.content !== message.content) return false;
                const a = parseChatTime(authoritative.createdAt);
                const b = parseChatTime(message.createdAt);
                return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 5 * 60_000;
              });
              if (match) { consumed.add(match.id); return false; }
              return true;
            });
            state.messages = state.messages.filter((message) => message.chatId !== chatId);
            state.messages.push(...messages);
            state.messages.push(...realtimeMessages);
          } else {
            const existingIds = new Set(state.messages.filter((message) => message.chatId === chatId).map((message) => message.id));
            state.messages.push(...messages.filter((message) => !existingIds.has(message.id)));
          }

          history.loading = false;
          history.error = null;
          if (!history.loadedPages.includes(page)) history.loadedPages.push(page);
          history.loadedPages.sort((a, b) => a - b);
          history.hasMore = messages.length === 50;
        })
        .addCase(fetchRoomChatHistory.rejected, (state, action) => {
          const chatId = action.meta.arg.chatId;
          const history = state.historyByChat[chatId];
          if (!history || history.requestId !== action.meta.requestId) return;
          history.loading = false;
          history.error = action.payload ?? action.error.message ?? "Không thể tải lịch sử tin nhắn.";
        });
  },
});

export const { resetMessages, addMessage, replaceMessage, removeMessage, clearConversationMessages, deleteMessage, importLocalMessages, invalidateHistory } = messagesSlice.actions;
export default messagesSlice.reducer;
