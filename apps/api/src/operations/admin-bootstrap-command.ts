import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/config';
import { normalizeEmail } from '../modules/users';
import { databaseOptions } from '../platform/database/database-options';

interface BootstrapUserRow {
  id: string;
  status: string;
  email_verified_at: Date | null;
  has_admin: boolean;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm'))
    throw new Error('Refusing ADMIN bootstrap without --confirm');
  const configuredEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  if (!configuredEmail) throw new Error('ADMIN_BOOTSTRAP_EMAIL is required');
  const email = normalizeEmail(configuredEmail);
  const config = loadConfig();
  const source = new DataSource(databaseOptions(config));
  try {
    await source.initialize();
    if (await source.showMigrations())
      throw new Error('Apply all migrations before ADMIN bootstrap');
    const outcome = await source.transaction(async (manager) => {
      const result: unknown = await manager.query(
        `SELECT account.id,account.status,account.email_verified_at,
                EXISTS(SELECT 1 FROM user_roles role WHERE role.user_id=account.id AND role.role='ADMIN') AS has_admin
         FROM users account WHERE account.email_normalized=$1 FOR UPDATE`,
        [email],
      );
      const row = bootstrapRow(result);
      if (!row || row.status !== 'ACTIVE' || !row.email_verified_at)
        throw new Error(
          'Target account must exist, be ACTIVE and have verified email',
        );
      if (row.has_admin) return { changed: false, userId: row.id };
      await manager.query(
        `INSERT INTO user_roles(user_id,role) VALUES ($1,'ADMIN') ON CONFLICT DO NOTHING`,
        [row.id],
      );
      await manager.query(
        `INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata)
         VALUES (NULL,'USER_ROLES_CHANGED','USER',$1,$2::jsonb)`,
        [
          row.id,
          JSON.stringify({
            changedFields: ['roles'],
            source: 'operator_admin_bootstrap',
          }),
        ],
      );
      return { changed: true, userId: row.id };
    });
    process.stdout.write(
      outcome.changed
        ? `ADMIN role granted to account ${outcome.userId}; audit recorded.\n`
        : `Account ${outcome.userId} already has ADMIN; no change made.\n`,
    );
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}

function bootstrapRow(value: unknown): BootstrapUserRow | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row: unknown = value[0];
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.status !== 'string' ||
    (record.email_verified_at !== null &&
      !(record.email_verified_at instanceof Date)) ||
    typeof record.has_admin !== 'boolean'
  )
    return null;
  return {
    id: record.id,
    status: record.status,
    email_verified_at: record.email_verified_at,
    has_admin: record.has_admin,
  };
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    [
      'Refusing ADMIN bootstrap without --confirm',
      'ADMIN_BOOTSTRAP_EMAIL is required',
      'Apply all migrations before ADMIN bootstrap',
      'Target account must exist, be ACTIVE and have verified email',
    ].includes(error.message)
      ? error.message
      : 'ADMIN bootstrap failed; check configuration and database access';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
