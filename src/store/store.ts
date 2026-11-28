import { combineReducers, configureStore, type UnknownAction } from "@reduxjs/toolkit";
import authReducer, { clearCredentials, setCredentials } from "../features/auth/authSlice.ts";
import contactsReducer from "../features/contacts/contactsSlice.ts";
import messagesReducer from "../features/messages/messagesSlice.ts";

const combined = combineReducers({auth:authReducer, contacts:contactsReducer, messages:messagesReducer});
export function rootReducer(state: ReturnType<typeof combined> | undefined, action: UnknownAction) {
    // Atomic reset: no render can observe a new identity with previous chat data.
    if (clearCredentials.match(action) || (setCredentials.match(action) && state?.auth.userId !== action.payload.userId)) {
        return combined(undefined, action);
    }
    // Discard chat updates while signed out, including late async completions.
    if (state && !state.auth.isAuthenticated && /^(messages|contacts)\//.test(action.type)) return state;
    return combined(state, action);
}
export const store = configureStore({reducer:rootReducer});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
