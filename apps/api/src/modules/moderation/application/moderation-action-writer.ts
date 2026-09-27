import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ModerationActionName } from '../domain/moderation.types';
import { ModerationAction } from '../infrastructure/persistence/moderation-action.entity';

@Injectable()
export class ModerationActionWriter {
  async user(
    moderatorId: string,
    targetUserId: string,
    action: Extract<
      ModerationActionName,
      'SUSPEND_USER' | 'BLOCK_USER' | 'RESTORE_USER'
    >,
    reasonCode: string,
    internalNote: string | null,
    manager: EntityManager,
  ): Promise<void> {
    await manager.insert(ModerationAction, {
      id: randomUUID(),
      moderatorId,
      targetType: 'USER',
      listingId: null,
      targetUserId,
      messageId: null,
      action,
      reasonCode,
      sellerMessage: null,
      internalNote,
      metadata: {},
    });
  }
}
