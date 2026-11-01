import type { DemoAccount } from '../types/account';
import type { Conversation, Message } from '../data/previewContent';

// Dữ liệu demo chỉ lưu trên trình duyệt. KHÔNG phải cơ chế xác thực an toàn.
const KEY = 'appchat_stage1_';
export function readDemo<T>(name: string, fallback: T): T {
  try { const value = localStorage.getItem(KEY + name); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}
export function saveDemo<T>(name: string, value: T): void {
  try { localStorage.setItem(KEY + name, JSON.stringify(value)); } catch { /* Trình duyệt chặn lưu trữ */ }
}
export function clearDemoSession(): void { sessionStorage.removeItem(KEY + 'session'); }
export function getDemoSession(): DemoAccount | null {
  try { const value = sessionStorage.getItem(KEY + 'session'); return value ? JSON.parse(value) as DemoAccount : null; }
  catch { return null; }
}
export function setDemoSession(account: DemoAccount): void { sessionStorage.setItem(KEY + 'session', JSON.stringify(account)); }
export type DemoChats = { conversations: Conversation[]; messages: Record<string, Message[]> };
