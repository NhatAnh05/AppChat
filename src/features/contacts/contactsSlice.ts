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
      const exists = state.friends.some(friend => friend.id.toLowerCase() === action.payload.id.toLowerCase());

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
      // Không thêm trùng nhóm khi GET_USER_LIST trả tên khác chữ hoa/thường.
      const unique = new Map<string, ContactEntry>();
      for (const group of action.payload) {
        unique.set(group.id.trim().toLocaleLowerCase('vi'), group);
      }
      state.groups = [...unique.values()];
      state.error = null;
    },

    addGroup: (state, action: PayloadAction<ContactEntry>) => {
      const exists = state.groups.some(group =>
        group.id.trim().toLocaleLowerCase('vi') === action.payload.id.trim().toLocaleLowerCase('vi')
      );

      if (!exists) {
        state.groups.push(action.payload);
      }
    },

    removeGroup: (state, action: PayloadAction<string>) => {
      state.groups = state.groups.filter(group =>
        group.id.trim().toLocaleLowerCase('vi') !== action.payload.trim().toLocaleLowerCase('vi')
      );

      if (state.selectedContactId === action.payload) {
        state.selectedContactId = null;
      }
    },

    setContactOnline: (
        state,
        action: PayloadAction<{ id: string; online: boolean | undefined; checkedAt?: number }>
    ) => {
      const contact = state.friends.find(
          friend => friend.id.toLowerCase() === action.payload.id.toLowerCase()
      );

      if (contact) {
        contact.online = action.payload.online;
        contact.onlineCheckedAt = action.payload.online === undefined ? undefined : action.payload.checkedAt;
      }
    },

    recordContactIncoming: (state, action: PayloadAction<{id:string;at:number}>) => {
      const contact=state.friends.find(friend=>friend.id.trim().toLowerCase()===action.payload.id.trim().toLowerCase());
      if (contact) contact.recentIncomingAt=action.payload.at;
    },
    expireOnlineStatuses: (state, action: PayloadAction<number>) => {
      state.friends.forEach(friend => {
        if (friend.recentIncomingAt!==undefined && action.payload-friend.recentIncomingAt>=180_000) friend.recentIncomingAt=undefined;
        if (friend.online !== undefined && (!friend.onlineCheckedAt || action.payload - friend.onlineCheckedAt >= 180_000)) {
          friend.online = undefined; friend.onlineCheckedAt = undefined;
        }
      });
    },
    clearOnlineStatuses: state => {
      state.friends.forEach(friend => { friend.online = undefined; friend.onlineCheckedAt = undefined; });
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
  clearOnlineStatuses,
  expireOnlineStatuses,
  recordContactIncoming,
  setSelectedContact,
  setContactsLoading,
  setContactsError,
  clearContacts,
} = contactsSlice.actions;

export default contactsSlice.reducer;
