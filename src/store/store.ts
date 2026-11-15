import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import contactsReducer from "../features/contacts/contactsSlice";
import messagesReducer from "../features/messages/messagesSlice";

export const store = configureStore({
    reducer: {
        auth: authReducer,
        contacts: contactsReducer,
        messages: messagesReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
