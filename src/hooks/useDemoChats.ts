import { useState } from 'react';
import { conversations as examples, sampleMessages, type Conversation, type Message } from '../data/previewContent';
import { readDemo, saveDemo } from '../services/demoStorage';

export function useDemoChats() {
  const [conversations, setConversations] = useState<Conversation[]>(() => readDemo('conversations', examples));
  const [messages, setMessages] = useState<Record<string, Message[]>>(() => readDemo('messages', sampleMessages));
  function sendMessage(chatId: string, text: string) {
    if (!text.trim()) return;
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const message: Message = { id: crypto.randomUUID(), fromMe: true, text: text.trim(), time, seen: false };
    setMessages(old => { const next = { ...old, [chatId]: [...(old[chatId] ?? []), message] }; saveDemo('messages', next); return next; });
    setConversations(old => { const next = old.map(chat => chat.id === chatId ? { ...chat, preview: text.trim(), time, unread: 0 } : chat); saveDemo('conversations', next); return next; });
  }
  function addConversation(name: string) {
    const existing = conversations.find(c => c.name === name);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    const chat: Conversation = { id, name, initial: name.slice(0,1).toUpperCase(), color:'#6484aa', preview:'Bắt đầu trò chuyện', time:'Mới', unread:0 };
    setConversations(old => { const next = [chat,...old]; saveDemo('conversations', next); return next; });
    return id;
  }
  function changeMessage(chatId: string, messageId: string, text: string) {
    const clean = text.trim();
    if (!clean) return;
    setMessages(old => {
      const next = { ...old, [chatId]: (old[chatId] ?? []).map(m => m.id === messageId && m.fromMe ? { ...m, text: clean, edited: true } : m) };
      saveDemo('messages', next); return next;
    });
  }
  function deleteMessage(chatId: string, messageId: string) {
    setMessages(old => {
      const next = { ...old, [chatId]: (old[chatId] ?? []).filter(m => m.id !== messageId || !m.fromMe) };
      saveDemo('messages', next); return next;
    });
  }
  return { conversations, messages, sendMessage, addConversation, changeMessage, deleteMessage };
}
