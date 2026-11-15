import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ContactEntry } from "../../types/contact";

type ContactsState = {
  friends: ContactEntry[];
  groups: ContactEntry[];
  loading: boolean;
  error: string | null;
  selectedContactId: string | null;
};

const initialState: ContactsState = {
  friends: [],
  groups: [],
  loading: false,
  error: null,
  selectedContactId: null,
};

const contactsSlice = createSlice({
  name: "contacts",
  initialState,
  reducers: {
    setFriends: (state, action: PayloadAction<ContactEntry[]>) => {
      state.friends = action.payload;
      state.error = null;
    },

    addFriend: (state, action: PayloadAction<ContactEntry>) => {
      const exists = state.friends.some(friend => friend.id === action.payload.id);

      if (!exists) {
        state.friends.push(action.payload);
      }
    },

    removeFriend: (state, action: PayloadAction<string>) => {
      state.friends = state.friends.filter(friend => friend.id !== action.payload);

      if (state.selectedContactId === action.payload) {
        state.selectedContactId = null;
      }
    },

    setGroups: (state, action: PayloadAction<ContactEntry[]>) => {
      state.groups = action.payload;
      state.error = null;
    },

    addGroup: (state, action: PayloadAction<ContactEntry>) => {
      const exists = state.groups.some(group => group.id === action.payload.id);

      if (!exists) {
        state.groups.push(action.payload);
      }
    },

    removeGroup: (state, action: PayloadAction<string>) => {
      state.groups = state.groups.filter(group => group.id !== action.payload);

      if (state.selectedContactId === action.payload) {
        state.selectedContactId = null;
      }
    },

    setContactOnline: (
        state,
        action: PayloadAction<{ id: string; online: boolean }>
    ) => {
      const contact = state.friends.find(
          friend => friend.id === action.payload.id
      );

      if (contact) {
        contact.online = action.payload.online;
      }
    },

    setSelectedContact: (
        state,
        action: PayloadAction<string | null>
    ) => {
      state.selectedContactId = action.payload;
    },

    setContactsLoading: (
        state,
        action: PayloadAction<boolean>
    ) => {
      state.loading = action.payload;
    },

    setContactsError: (
        state,
        action: PayloadAction<string | null>
    ) => {
      state.error = action.payload;
    },

    clearContacts: state => {
      state.friends = [];
      state.groups = [];
      state.selectedContactId = null;
      state.loading = false;
      state.error = null;
    },
  },
});

export const {
  setFriends,
  addFriend,
  removeFriend,
  setGroups,
  addGroup,
  removeGroup,
  setContactOnline,
  setSelectedContact,
  setContactsLoading,
  setContactsError,
  clearContacts,
} = contactsSlice.actions;

export default contactsSlice.reducer;
