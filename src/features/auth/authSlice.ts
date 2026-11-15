import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type AuthState = {
  userId: string | null;
  reLoginCode: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
};

const initialState: AuthState = {
  userId: null,
  reLoginCode: null,
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

    setCredentials: (
        state,
        action: PayloadAction<{ userId: string; reLoginCode: string }>
    ) => {
      state.userId = action.payload.userId;
      state.reLoginCode = action.payload.reLoginCode;
      state.isAuthenticated = true;
      state.loading = false;
      state.error = null;

      localStorage.setItem("userId", action.payload.userId);
      localStorage.setItem("reLoginCode", action.payload.reLoginCode);
    },

    setAuthError: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    },

    clearAuthError: (state) => {
      state.error = null;
    },

    clearCredentials: () => {
      localStorage.removeItem("userId");
      localStorage.removeItem("reLoginCode");
      return initialState;
    },
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
