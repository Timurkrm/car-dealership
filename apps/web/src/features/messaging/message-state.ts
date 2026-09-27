import type { MessageItem } from './messaging-client';

export type DisplayMessage = MessageItem & {
  delivery?: 'sending' | 'failed';
};

export function mergeMessages(
  current: DisplayMessage[],
  incoming: DisplayMessage[],
): DisplayMessage[] {
  const byId = new Map<string, DisplayMessage>();
  for (const message of [...current, ...incoming]) {
    const duplicate = [...byId.values()].find(
      (row) =>
        row.id === message.id ||
        (row.senderId === message.senderId &&
          row.clientMessageId === message.clientMessageId),
    );
    if (duplicate) byId.delete(duplicate.id);
    byId.set(message.id, message);
  }
  return [...byId.values()].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
