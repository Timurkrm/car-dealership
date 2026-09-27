import { ApiException } from '../../../platform/http/api-error';

export const conversationNotFound = () =>
  new ApiException(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
export const conversationUnavailable = () =>
  new ApiException(
    404,
    'CONVERSATION_LISTING_UNAVAILABLE',
    'Listing is unavailable',
  );
export const selfConversation = () =>
  new ApiException(
    400,
    'CONVERSATION_SELF_FORBIDDEN',
    'You cannot message yourself',
  );
export const idempotencyConflict = () =>
  new ApiException(
    409,
    'MESSAGE_IDEMPOTENCY_CONFLICT',
    'clientMessageId was already used with different content',
  );
export const messagingReadOnly = () =>
  new ApiException(
    409,
    'CONVERSATION_READ_ONLY',
    'This conversation is read-only',
  );
export const invalidMessage = () =>
  new ApiException(
    400,
    'MESSAGE_INVALID_BODY',
    'Message must contain 1 to 8000 characters',
  );
