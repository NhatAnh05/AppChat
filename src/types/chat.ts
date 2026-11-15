export type Chat = {
  id: string
  name: string
  avatar: string
  avatarColor: string
  lastMessage: string
  time: string
  unreadCount?: number
  online?: boolean
  kind?: "people" | "group"
}

export type ChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  recipientId?: string;
  recipientName?: string;
  content: string;
  createdAt: string;
  orderAt?: string;
  type?: number;
};
