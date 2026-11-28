import { combineReducers, configureStore, type UnknownAction } from "@reduxjs/toolkit";
import authReducer, { clearCredentials, setCredentials } from "../features/auth/authSlice.ts";
import contactsReducer, {removeGroup,setGroups} from "../features/contacts/contactsSlice.ts";
import messagesReducer, {addMessage,replaceMessage,fetchRoomChatHistory,clearConversationMessages} from "../features/messages/messagesSlice.ts";

const combined = combineReducers({auth:authReducer, contacts:contactsReducer, messages:messagesReducer});
export function rootReducer(state: ReturnType<typeof combined> | undefined, action: UnknownAction) {
    // Atomic reset: no render can observe a new identity with previous chat data.
    if (clearCredentials.match(action) || (setCredentials.match(action) && state?.auth.userId !== action.payload.userId)) {
        return combined(undefined, action);
    }
    // Discard chat updates while signed out, including late async completions.
    if (state && !state.auth.isAuthenticated && /^(messages|contacts)\//.test(action.type)) return state;
    if (state) {
        const id = addMessage.match(action) ? action.payload.chatId : replaceMessage.match(action) ? action.payload.message.chatId :
          fetchRoomChatHistory.pending.match(action) || fetchRoomChatHistory.fulfilled.match(action) || fetchRoomChatHistory.rejected.match(action) ? action.meta.arg.chatId : undefined;
        if (id?.startsWith('room:') && !state.contacts.groups.some(group=>group.id.trim().toLowerCase()===id.slice(5).trim().toLowerCase())) return state;
    }
    let next=combined(state, action);
    if (removeGroup.match(action) || setGroups.match(action)) {
        for (const id of new Set([...Object.keys(next.messages.historyByChat),...next.messages.messages.map(m=>m.chatId)])) {
            if (id.startsWith('room:') && !next.contacts.groups.some(group=>group.id.trim().toLowerCase()===id.slice(5).trim().toLowerCase()))
                next=combined(next,clearConversationMessages(id));
        }
    }
    return next;
}
export const store = configureStore({reducer:rootReducer});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
