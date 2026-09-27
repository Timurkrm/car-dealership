export const REALTIME_EVENTS = {
  messageCreated: 'message:created',
  conversationUpdated: 'conversation:updated',
  conversationRead: 'conversation:read',
  notificationCreated: 'notification:created',
  notificationRead: 'notification:read',
  notificationsReadAll: 'notifications:read-all',
} as const;

export const userRoom = (userId: string) => `user:${userId}`;
export const conversationRoom = (conversationId: string) =>
  `conversation:${conversationId}`;
export const sessionRoom = (sessionId: string) => `session:${sessionId}`;
