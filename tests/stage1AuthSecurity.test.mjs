import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authSlice = readFileSync(new URL('../src/features/auth/authSlice.ts', import.meta.url), 'utf8');
const loginForm = readFileSync(new URL('../src/components/Login.tsx', import.meta.url), 'utf8');
const sessionStore = readFileSync(new URL('../src/services/sessionStore.ts', import.meta.url), 'utf8');

test('Redux auth không lưu RE_LOGIN_CODE, không có side effect vào localStorage', () => {
  assert.doesNotMatch(authSlice, /state\.reLoginCode/);
  assert.doesNotMatch(authSlice, /localStorage\.(setItem|removeItem)/);
  assert.match(authSlice, /PayloadAction<\{ userId: string \}>/);
  assert.doesNotMatch(loginForm, /dispatch\(setCredentials\(/);
  assert.match(sessionStore, /sessionStorage/);
});
