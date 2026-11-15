import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ChatMessage } from "../../types/chat";
import { peopleChatService } from "../../services/peopleChatService";

type ConversationHistoryState = {
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

const initialState: MessagesState = {
  messages: [],
  historyByChat: {},
};

const messagesSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {
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
        history.loading = true;
        history.error = null;
        state.historyByChat[chatId] = history;
      })
      .addCase(fetchPeopleChatHistory.fulfilled, (state, action) => {
        const { chatId, page, messages } = action.payload;
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
          const realtimeMessages = currentMessages.filter(
            (message) => message.orderAt && !loadedIds.has(message.id),
          );
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
        if (!history) return;
        history.loading = false;
        history.error = action.payload ?? action.error.message ?? "Không thể tải lịch sử tin nhắn.";
      });
  },
});

export const { addMessage, replaceMessage, removeMessage, deleteMessage, importLocalMessages, invalidateHistory } = messagesSlice.actions;
export default messagesSlice.reducer;
