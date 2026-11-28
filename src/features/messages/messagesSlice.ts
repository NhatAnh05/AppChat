import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ChatMessage } from "../../types/chat";
import { peopleChatService } from "../../services/peopleChatService.ts";
import { mergeChatHistory } from "../../services/chatHistoryReconciliation.ts";
import type { CreatedRoomMember } from "../../services/createRoomProtocol.ts";
import { getRoomHistory } from "../../services/roomChatService.ts";

type ConversationHistoryState = {
  requestId?: string;
  requestedPage?: number;
  roomMembers?: CreatedRoomMember[];
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
type FetchHistoryResult = { chatId: string; page: number; messages: ChatMessage[]; roomMembers?: CreatedRoomMember[] };

export const fetchPeopleChatHistory = createAsyncThunk<
    FetchHistoryResult,
    FetchHistoryArgs,
    { rejectValue: string }
>("messages/fetchPeopleChatHistory", async ({ username, chatId, page = 1 }, { rejectWithValue, signal }) => {
  try {
    const messages = await peopleChatService.getHistory(username, page, signal);
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
>('messages/fetchRoomChatHistory', async ({username,chatId,page=1},{rejectWithValue,signal})=>{
  try { const result = await getRoomHistory(username,page,{signal}); return {chatId,page,messages:result.messages,roomMembers:result.room.user}; }
  catch(error){return rejectWithValue(error instanceof Error?error.message:'Không tải được lịch sử nhóm.');}
},{
  condition:({chatId,page=1,force=false},{getState})=>{
    const state=getState() as {messages:MessagesState;contacts:{groups:{id:string}[]}};
    if(!chatId.startsWith('room:') || !state.contacts.groups.some(group=>group.id.trim().toLowerCase()===chatId.slice(5).trim().toLowerCase()))return false;
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
              message.id === action.payload.id,
      );
      if (!alreadyAdded) {
        const item=action.payload;
        // Reconcile late realtime with history already present, rather than append blindly.
        const current=state.messages.filter(m=>m.chatId===item.chatId);
        state.messages=state.messages.filter(m=>m.chatId!==item.chatId);
        state.messages.push(...mergeChatHistory(current,[item]));
      }
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
        state.messages[confirmedIndex].sendStatus = action.payload.message.sendStatus;
        state.messages.splice(optimisticIndex, 1);
        return;
      }
      const knownServerIds=state.messages[optimisticIndex].knownServerIds;
      state.messages[optimisticIndex] = {...action.payload.message,...(action.payload.message.id.startsWith('ack:')?{knownServerIds}:{})};
      const current=state.messages.filter(m=>m.chatId===chatId);
      state.messages=state.messages.filter(m=>m.chatId!==chatId);
      state.messages.push(...mergeChatHistory(current,[]));
    },
    setMessageStatus: (state, action: PayloadAction<{chatId:string;id:string;status:NonNullable<ChatMessage['sendStatus']>}>) => {
      const item = state.messages.find(m => m.chatId === action.payload.chatId && m.id === action.payload.id);
      if (item) {
        item.sendStatus = action.payload.status;
        if (action.payload.status==='unconfirmed') {
          const chatId=action.payload.chatId;
          const current=state.messages.filter(m=>m.chatId===chatId);
          state.messages=state.messages.filter(m=>m.chatId!==chatId);
          state.messages.push(...mergeChatHistory(current,[]));
        }
      }
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
          history.requestedPage = action.meta.arg.page ?? 1;
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

          const currentMessages = state.messages.filter(message => message.chatId === chatId);
          state.messages = state.messages.filter(message => message.chatId !== chatId);
          state.messages.push(...mergeChatHistory(currentMessages, messages.map(message => ({...message, chatId}))));

          history.loading = false;
          history.error = null;
          if (action.payload.roomMembers) history.roomMembers = action.payload.roomMembers;
          if (!history.loadedPages.includes(page)) history.loadedPages.push(page);
          history.loadedPages.sort((a, b) => a - b);
          if (page === Math.max(...history.loadedPages)) history.hasMore = messages.length === 50;
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
          history.requestedPage = action.meta.arg.page ?? 1;
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

          const currentMessages = state.messages.filter(message => message.chatId === chatId);
          state.messages = state.messages.filter(message => message.chatId !== chatId);
          state.messages.push(...mergeChatHistory(currentMessages, messages.map(message => ({...message, chatId}))));

          history.loading = false;
          history.error = null;
          if (action.payload.roomMembers) history.roomMembers = action.payload.roomMembers;
          if (!history.loadedPages.includes(page)) history.loadedPages.push(page);
          history.loadedPages.sort((a, b) => a - b);
          if (page === Math.max(...history.loadedPages)) history.hasMore = messages.length === 50;
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

export const { resetMessages, addMessage, replaceMessage, setMessageStatus, removeMessage, clearConversationMessages, deleteMessage, importLocalMessages, invalidateHistory } = messagesSlice.actions;
export default messagesSlice.reducer;
