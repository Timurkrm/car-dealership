import { loadEnvFile } from 'node:process';
import pg from 'pg';

loadEnvFile('.env');
if (process.env.NODE_ENV !== 'development')
  throw new Error(
    'dev:grant-admin is available only with NODE_ENV=development',
  );
const email = process.env.DEV_ADMIN_EMAIL?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+$/.test(email))
  throw new Error('Set DEV_ADMIN_EMAIL to an existing verified local account');
const client = new pg.Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});
await client.connect();
try {
  await client.query('BEGIN');
  const users = await client.query(
    `SELECT id,status,email_verified_at FROM users WHERE email_normalized=$1 FOR UPDATE`,
    [email],
  );
  const user = users.rows[0];
  if (!user || user.status !== 'ACTIVE' || !user.email_verified_at)
    throw new Error('Account must exist, be ACTIVE and have verified email');
  await client.query(
    `INSERT INTO user_roles(user_id,role) VALUES ($1,'ADMIN') ON CONFLICT DO NOTHING`,
    [user.id],
  );
  await client.query(
    `INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata)
     VALUES (NULL,'USER_ROLES_CHANGED','USER',$1,'{"changedFields":["roles"]}'::jsonb)`,
    [user.id],
  );
  await client.query('COMMIT');
  process.stdout.write(
    `Granted ADMIN to verified development account ${email}.\n`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
