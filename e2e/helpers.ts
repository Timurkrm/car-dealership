import { expect, type Page } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { Client } from 'pg';

export const password = 'Marketplace-e2e-password-2026!';
export const users = {
  seller: 'seller@example.test',
  buyer: 'buyer@example.test',
  moderator: 'moderator@example.test',
  admin: 'admin@example.test',
  blocked: 'blocked@example.test',
  secondSeller: 'seller2@example.test',
} as const;

export function observeBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const value = message.text();
    // Anonymous bootstrap intentionally probes the HttpOnly refresh cookie.
    if (
      message.type() === 'error' &&
      !value.includes('the server responded with a status of 401')
    )
      errors.push(`console: ${value}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 500)
      errors.push(`http ${response.status()}: ${response.url()}`);
  });
  return () => expect(errors, errors.join('\n')).toEqual([]);
}

export async function login(page: Page, email = users.buyer) {
  await page.goto('/login');
  const form = page.locator('main form').first();
  await form.getByLabel('Email').fill(email);
  await form.getByLabel('Пароль').fill(password);
  await form.getByRole('button', { name: 'Вход' }).click();
  await expect(page).toHaveURL(/\/account/);
}

export async function issueActionToken(
  email: string,
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
) {
  const secret = randomBytes(32).toString('base64url');
  const digest = createHash('sha256')
    .update(`${purpose}:${secret}`, 'utf8')
    .digest('hex');
  const database = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  });
  await database.connect();
  try {
    await database.query(
      `DELETE FROM auth_action_tokens token
       USING users account
       WHERE token.user_id=account.id AND account.email_normalized=$1
         AND token.purpose=$2`,
      [email, purpose],
    );
    const result = await database.query(
      `INSERT INTO auth_action_tokens(user_id,purpose,token_hash,expires_at)
       SELECT id,$2,$3,CURRENT_TIMESTAMP + interval '10 minutes'
       FROM users WHERE email_normalized=$1
       RETURNING id`,
      [email, purpose, digest],
    );
    expect(result.rowCount).toBe(1);
    return secret;
  } finally {
    await database.end();
  }
}
