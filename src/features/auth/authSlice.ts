import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type AuthState = {
  userId: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
};

const initialState: AuthState = {
  userId: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
      state.error = null;
    },

    // Reducer chỉ lưu thông tin hiển thị, KHÔNG lưu RE_LOGIN_CODE vào Redux hoặc localStorage.
    setCredentials: (
        state,
        action: PayloadAction<{ userId: string }>
    ) => {
      state.userId = action.payload.userId;
      state.isAuthenticated = true;
      state.loading = false;
      state.error = null;

    },

    setAuthError: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    clearAuthError: (state) => {
      state.error = null;
    },

    clearCredentials: () => initialState,
  },
});

export const {
  setLoading,
  setCredentials,
  setAuthError,
  clearAuthError,
  clearCredentials,
} = authSlice.actions;

export default authSlice.reducer;
