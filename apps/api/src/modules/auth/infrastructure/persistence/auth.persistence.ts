import type { DataSource, EntityManager } from 'typeorm';
import { UserCredential } from './user-credential.entity';
import { UserSession } from './user-session.entity';
import { SessionToken } from './session-token.entity';
import { ActionToken } from './action-token.entity';
import type { ActionTokenPurpose } from '../../domain/auth.types';

export class AuthPersistence {
  constructor(readonly source: DataSource) {}
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.source.transaction(work);
  }
  findCredentialForAuthentication(
    userId: string,
    manager = this.source.manager,
  ): Promise<UserCredential | null> {
    return manager
      .getRepository(UserCredential)
      .createQueryBuilder('credential')
      .addSelect('credential.passwordHash')
      .where('credential.userId = :userId', { userId })
      .getOne();
  }
  async createCredential(
    userId: string,
    passwordHash: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager.insert(UserCredential, { userId, passwordHash });
  }
  async replacePassword(
    userId: string,
    passwordHash: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(UserCredential, { userId }, { passwordHash });
  }
  async locateRefresh(
    tokenHash: string,
  ): Promise<{ userId: string; sessionId: string } | null> {
    const rows: { userId: string; sessionId: string }[] =
      await this.source.query(
        'SELECT session.user_id AS "userId", session.id AS "sessionId" FROM session_tokens token JOIN user_sessions session ON session.id = token.session_id WHERE token.token_hash = $1',
        [tokenHash],
      );
    return rows[0] ?? null;
  }
  findSession(
    id: string,
    manager = this.source.manager,
    lock = false,
  ): Promise<UserSession | null> {
    const query = manager
      .getRepository(UserSession)
      .createQueryBuilder('session')
      .where('session.id = :id', { id });
    if (lock) query.setLock('pessimistic_write');
    return query.getOne();
  }
  findRefresh(
    tokenHash: string,
    manager: EntityManager,
  ): Promise<SessionToken | null> {
    return manager
      .getRepository(SessionToken)
      .createQueryBuilder('token')
      .addSelect('token.tokenHash')
      .where('token.tokenHash = :tokenHash', { tokenHash })
      .setLock('pessimistic_write')
      .getOne();
  }
  async createSession(
    input: { id: string; userId: string; expiresAt: Date },
    manager: EntityManager,
  ): Promise<void> {
    // created_at and last_used_at must share the database clock. Mixing an
    // application timestamp with the database default can make last_used_at a
    // few milliseconds earlier and violate ck_user_sessions_dates.
    await manager.query(
      `INSERT INTO user_sessions(id,user_id,expires_at,last_used_at)
       VALUES ($1,$2,$3,CURRENT_TIMESTAMP)`,
      [input.id, input.userId, input.expiresAt],
    );
  }
  async addRefresh(
    input: { sessionId: string; tokenHash: string; expiresAt: Date },
    manager: EntityManager,
  ): Promise<void> {
    await manager.insert(SessionToken, input);
  }
  async consumeRefresh(
    id: string,
    sessionId: string,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(SessionToken, { id }, { consumedAt: now });
    await manager.update(UserSession, { id: sessionId }, { lastUsedAt: now });
  }
  /** Call after acquiring user lock. One revocation implementation for every flow. */
  async revokeSession(
    id: string,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      'UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, $2) WHERE id = $1',
      [id, now],
    );
    await manager.query(
      'UPDATE session_tokens SET revoked_at = COALESCE(revoked_at, $2) WHERE session_id = $1',
      [id, now],
    );
  }
  async revokeAllUserSessions(
    userId: string,
    now: Date,
    manager: EntityManager,
    exceptSessionId?: string,
  ): Promise<void> {
    await manager.query(
      'UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, $2) WHERE user_id = $1 AND ($3::uuid IS NULL OR id <> $3)',
      [userId, now, exceptSessionId ?? null],
    );
    await manager.query(
      'UPDATE session_tokens token SET revoked_at = COALESCE(token.revoked_at, $2) FROM user_sessions session WHERE token.session_id = session.id AND session.user_id = $1 AND ($3::uuid IS NULL OR session.id <> $3)',
      [userId, now, exceptSessionId ?? null],
    );
  }
  findAction(
    tokenHash: string,
    purpose: ActionTokenPurpose,
    manager = this.source.manager,
    lock = false,
  ): Promise<ActionToken | null> {
    const query = manager
      .getRepository(ActionToken)
      .createQueryBuilder('token')
      .addSelect('token.tokenHash')
      .addSelect('token.targetEmailNormalized')
      .where('token.tokenHash = :tokenHash AND token.purpose = :purpose', {
        tokenHash,
        purpose,
      });
    if (lock) query.setLock('pessimistic_write');
    return query.getOne();
  }
  async revokeActions(
    userId: string,
    purpose: ActionTokenPurpose,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      'UPDATE auth_action_tokens SET revoked_at = $3 WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL AND revoked_at IS NULL',
      [userId, purpose, now],
    );
  }
  async addAction(
    input: {
      id?: string;
      userId: string;
      purpose: ActionTokenPurpose;
      tokenHash: string;
      expiresAt: Date;
      targetEmailNormalized?: string | null;
      retainedSessionId?: string | null;
    },
    manager: EntityManager,
  ): Promise<void> {
    await manager.insert(ActionToken, input);
  }
  async consumeAction(
    id: string,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(ActionToken, { id }, { consumedAt: now });
  }
  findPendingEmailChange(userId: string): Promise<ActionToken | null> {
    return this.source.manager
      .getRepository(ActionToken)
      .createQueryBuilder('token')
      .addSelect('token.targetEmailNormalized')
      .where(
        "token.userId=:userId AND token.purpose='EMAIL_CHANGE' AND token.consumedAt IS NULL AND token.revokedAt IS NULL AND token.expiresAt > CURRENT_TIMESTAMP",
        { userId },
      )
      .orderBy('token.createdAt', 'DESC')
      .getOne();
  }
  /** Retain complete refresh histories through family expiry + an extra day. Bounded, SKIP LOCKED. */
  async cleanup(
    now: Date,
    limit = 500,
  ): Promise<{ sessions: number; actions: number }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new RangeError('Cleanup limit must be 1–1000');
    const cutoff = new Date(now.getTime() - 86400000);
    return this.transaction(async (manager) => {
      const sessions: { id: string }[] = await manager.query(
        'WITH candidates AS (SELECT id FROM user_sessions WHERE expires_at < $1 ORDER BY expires_at, id LIMIT $2 FOR UPDATE SKIP LOCKED), removed AS (DELETE FROM user_sessions WHERE id IN (SELECT id FROM candidates) RETURNING id) SELECT id FROM removed',
        [cutoff, limit],
      );
      const actions: { id: string }[] = await manager.query(
        'WITH candidates AS (SELECT id FROM auth_action_tokens WHERE expires_at < $1 ORDER BY expires_at, id LIMIT $2 FOR UPDATE SKIP LOCKED), removed AS (DELETE FROM auth_action_tokens WHERE id IN (SELECT id FROM candidates) RETURNING id) SELECT id FROM removed',
        [cutoff, limit],
      );
      return { sessions: sessions.length, actions: actions.length };
    });
  }
  async listActiveSessions(
    userId: string,
    idleSeconds: number,
  ): Promise<UserSession[]> {
    return this.source.query(
      `SELECT id, user_id AS "userId", expires_at AS "expiresAt",
       revoked_at AS "revokedAt", last_used_at AS "lastUsedAt",
       created_at AS "createdAt"
       FROM user_sessions
       WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
         AND COALESCE(last_used_at, created_at) > CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second')
       ORDER BY COALESCE(last_used_at, created_at) DESC, created_at DESC, id DESC
       LIMIT 50`,
      [userId, idleSeconds],
    );
  }
  async activeSessionIds(
    userId: string,
    manager: EntityManager,
    exceptSessionId?: string,
  ): Promise<string[]> {
    const rows: Array<{ id: string }> = await manager.query(
      `SELECT id FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL
       AND ($2::uuid IS NULL OR id <> $2) ORDER BY id`,
      [userId, exceptSessionId ?? null],
    );
    return rows.map((row) => row.id);
  }
}
