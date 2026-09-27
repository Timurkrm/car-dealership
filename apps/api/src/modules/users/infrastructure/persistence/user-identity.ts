import type { DataSource, EntityManager } from 'typeorm';
import { In } from 'typeorm';
import { User } from './user.entity';
import { UserRole } from './user-role.entity';
import type { UserRoleName } from '../../domain/user.types';

/** Explicit identity API. Only this module queries profile/role tables. */
export class UserIdentity {
  constructor(private readonly source: DataSource) {}
  publicSummaries(
    ids: string[],
    manager: EntityManager,
  ): Promise<Pick<User, 'id' | 'displayName'>[]> {
    if (!ids.length) return Promise.resolve([]);
    return manager.find(User, {
      where: { id: In(ids) },
      select: { id: true, displayName: true },
    });
  }
  findForAuthentication(
    emailNormalized: string,
    manager = this.source.manager,
  ): Promise<User | null> {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.emailNormalized')
      .where('user.emailNormalized = :emailNormalized', { emailNormalized })
      .getOne();
  }
  findForCurrentUser(
    id: string,
    manager = this.source.manager,
  ): Promise<User | null> {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.emailNormalized')
      .where('user.id = :id', { id })
      .getOne();
  }
  lockForAuthentication(
    id: string,
    manager: EntityManager,
  ): Promise<User | null> {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.emailNormalized')
      .where('user.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
  }
  async rolesFor(
    id: string,
    manager = this.source.manager,
  ): Promise<UserRoleName[]> {
    const records = await manager
      .getRepository(UserRole)
      .find({ where: { userId: id }, order: { role: 'ASC' } });
    return records.map((record) => record.role);
  }
  async activeIds(
    ids: string[],
    manager: EntityManager = this.source.manager,
  ): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await manager.find(User, {
      where: { id: In(ids), status: 'ACTIVE' },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }
  async emailDeliveryRecipients(ids: readonly string[]): Promise<
    Map<
      string,
      {
        email: string;
        verified: boolean;
        status: User['status'];
      }
    >
  > {
    if (!ids.length) return new Map();
    const rows: Array<{
      id: string;
      email: string;
      verified: boolean;
      status: User['status'];
    }> = await this.source.query(
      `SELECT id, email_normalized AS email,
       (email_verified_at IS NOT NULL) AS verified, status
       FROM users WHERE id = ANY($1::uuid[])`,
      [[...new Set(ids)]],
    );
    return new Map(
      rows.map((row) => [
        row.id,
        { email: row.email, verified: row.verified, status: row.status },
      ]),
    );
  }
  async createPendingAccount(
    input: { id: string; emailNormalized: string; displayName: string },
    manager: EntityManager,
  ): Promise<void> {
    await manager.insert(User, { ...input, status: 'PENDING_VERIFICATION' });
    await manager.insert(UserRole, { userId: input.id, role: 'USER' });
  }
  async confirmEmail(
    user: User,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(
      User,
      { id: user.id },
      {
        emailVerifiedAt: now,
        status: user.status === 'PENDING_VERIFICATION' ? 'ACTIVE' : user.status,
      },
    );
  }
  async updateDisplayName(
    id: string,
    displayName: string,
  ): Promise<User | null> {
    const result = await this.source.manager
      .createQueryBuilder()
      .update(User)
      .set({ displayName })
      .where("id=:id AND status='ACTIVE'", { id })
      .execute();
    if (!result.affected) return null;
    return this.findForCurrentUser(id);
  }
  async changeEmail(
    id: string,
    emailNormalized: string,
    verifiedAt: Date,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(
      User,
      { id },
      { emailNormalized, emailVerifiedAt: verifiedAt },
    );
  }
}
