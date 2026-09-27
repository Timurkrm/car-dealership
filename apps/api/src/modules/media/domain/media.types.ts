export const MEDIA_TYPES = ['IMAGE'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
export const MEDIA_STATUSES = [
  'PENDING',
  'PROCESSING',
  'READY',
  'UPLOADED',
  'FAILED',
  'DELETED',
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];
