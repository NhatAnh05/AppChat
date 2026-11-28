export type Chat = {
  id: string
  name: string
  avatar: string
  avatarColor: string
  actionTime?: string
  lastMessage: string
  time: string
  unreadCount?: number
  online?: boolean
  recentIncomingAt?: number
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
  /** Page provenance for notification baselining; never a delivery receipt. */
  historyPage?: number;
  /** Portable backup copies cannot serve as server confirmation. */
  backupOriginalId?: string;
  sendStatus?: 'pending' | 'confirmed' | 'unconfirmed' | 'failed';
  type?: number;
  /** Server IDs known when the optimistic send was created. */
  knownServerIds?: string[];
  /** Display-only link; an unconfirmed request remains unconfirmed. */
  historyMatchId?: string;
  /** A provisional realtime row already paired to this server ID. */
  reconciledLiveId?: string;
};
