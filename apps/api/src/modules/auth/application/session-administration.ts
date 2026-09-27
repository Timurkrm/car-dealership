import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuthPersistence } from '../infrastructure/persistence/auth.persistence';

@Injectable()
export class SessionAdministration {
  constructor(
    @Inject(AuthPersistence) private readonly persistence: AuthPersistence,
  ) {}

  async activeCount(userId: string, manager: EntityManager): Promise<number> {
    const rows: { count: number }[] = await manager.query(
      'SELECT COUNT(*)::integer count FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
      [userId],
    );
    return rows[0]?.count ?? 0;
  }

  revokeAll(userId: string, now: Date, manager: EntityManager): Promise<void> {
    return this.persistence.revokeAllUserSessions(userId, now, manager);
  }
}
