import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { normalizeEmail } from '../domain/user.types';
import type { UserRoleName, UserStatus } from '../domain/user.types';
import { User } from '../infrastructure/persistence/user.entity';
import { UserRole } from '../infrastructure/persistence/user-role.entity';

export interface AdminUserFilters {
  status?: UserStatus;
  role?: UserRoleName;
  userId?: string;
  email?: string;
  createdFrom?: Date;
  createdTo?: Date;
  limit: number;
}
export interface AdminUserPosition {
  createdAt: string;
  id: string;
}

@Injectable()
export class UserAdministrationRecords {
  async lock(id: string, manager: EntityManager): Promise<User | null> {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.emailNormalized')
      .where('user.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
  }

  async find(id: string, manager: EntityManager): Promise<User | null> {
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.emailNormalized')
      .where('user.id = :id', { id })
      .getOne();
  }

  async summaries(ids: string[], manager: EntityManager) {
    if (!ids.length) return [];
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.emailNormalized')
      .where('user.id IN (:...ids)', { ids })
      .getMany();
  }

  async list(
    filters: AdminUserFilters,
    position: AdminUserPosition | null,
    manager: EntityManager,
  ) {
    const query = manager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.emailNormalized');
    if (filters.status)
      query.andWhere('user.status = :status', { status: filters.status });
    if (filters.userId)
      query.andWhere('user.id = :userId', { userId: filters.userId });
    if (filters.email)
      query.andWhere('user.emailNormalized = :email', {
        email: normalizeEmail(filters.email),
      });
    if (filters.role)
      query.andWhere(
        'EXISTS (SELECT 1 FROM user_roles role_filter WHERE role_filter.user_id = user.id AND role_filter.role = :role)',
        { role: filters.role },
      );
    if (filters.createdFrom)
      query.andWhere('user.createdAt >= :createdFrom', {
        createdFrom: filters.createdFrom,
      });
    if (filters.createdTo)
      query.andWhere('user.createdAt <= :createdTo', {
        createdTo: filters.createdTo,
      });
    if (position)
      query.andWhere(
        '(user.createdAt < :cursorCreated OR (user.createdAt = :cursorCreated AND user.id < :cursorId))',
        { cursorCreated: position.createdAt, cursorId: position.id },
      );
    const result = await query
      .addSelect(
        `to_char(user.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        'cursor_created_at',
      )
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .limit(filters.limit + 1)
      .getRawAndEntities();
    const users = result.entities;
    const cursorCreatedById = new Map<string, string>(
      users.map((user, index) => [
        user.id,
        (result.raw[index] as { cursor_created_at: string }).cursor_created_at,
      ]),
    );
    const roles = users.length
      ? await manager
          .getRepository(UserRole)
          .createQueryBuilder('role')
          .where('role.userId IN (:...ids)', {
            ids: users.map((row) => row.id),
          })
          .orderBy('role.role', 'ASC')
          .getMany()
      : [];
    const rolesByUser = new Map<string, UserRoleName[]>();
    for (const row of roles) {
      const current = rolesByUser.get(row.userId) ?? [];
      current.push(row.role);
      rolesByUser.set(row.userId, current);
    }
    return { users, rolesByUser, cursorCreatedById };
  }

  roles(id: string, manager: EntityManager): Promise<UserRole[]> {
    return manager.find(UserRole, {
      where: { userId: id },
      order: { role: 'ASC' },
    });
  }

  async setStatus(
    id: string,
    status: UserStatus,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(User)
      .set({ status, updatedAt: () => 'CURRENT_TIMESTAMP' })
      .where('id = :id', { id })
      .execute();
  }

  async replaceRoles(
    id: string,
    roles: readonly UserRoleName[],
    manager: EntityManager,
  ): Promise<void> {
    await manager.delete(UserRole, { userId: id });
    await manager.insert(
      UserRole,
      roles.map((role) => ({ userId: id, role })),
    );
  }

  async activeAdminCount(manager: EntityManager): Promise<number> {
    const rows: { count: number }[] = await manager.query(
      `SELECT COUNT(*)::integer count FROM user_roles role JOIN users "user" ON "user".id = role.user_id WHERE role.role = 'ADMIN' AND "user".status = 'ACTIVE'`,
    );
    return rows[0]?.count ?? 0;
  }
}
