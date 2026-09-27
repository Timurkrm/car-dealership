import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AuthClient } from '../src/features/auth/auth-client';
import { WorkspaceApi } from '../src/features/administration/workspace-api';
import {
  canAdminister,
  canModerate,
  formatAge,
  safeAuditMetadata,
} from '../src/features/administration/workspace-types';

const json = (value: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });

test('workspace visibility keeps moderator and administrator capabilities distinct', () => {
  assert.equal(canModerate(['USER']), false);
  assert.equal(canModerate(['USER', 'MODERATOR']), true);
  assert.equal(canModerate(['USER', 'ADMIN']), true);
  assert.equal(canAdminister(['USER', 'MODERATOR']), false);
  assert.equal(canAdminister(['USER', 'ADMIN']), true);
});

test('moderation age and audit metadata are deterministic allowlisted text', () => {
  assert.equal(
    formatAge(
      '2026-09-19T10:00:00.000Z',
      Date.parse('2026-09-20T12:00:00.000Z'),
    ),
    '1 д',
  );
  assert.equal(
    safeAuditMetadata({
      id: 'audit',
      createdAt: '2026-09-20T00:00:00Z',
      actorUserId: null,
      action: 'USER_BLOCKED',
      targetType: 'USER',
      targetId: 'user',
      requestId: null,
      metadata: {
        reasonCode: 'FRAUD_RISK',
        previousStatus: 'ACTIVE',
        nextStatus: 'BLOCKED',
      },
    }),
    'FRAUD_RISK · ACTIVE → BLOCKED',
  );
});

test('workspace API preserves If-Match and encodes filters without leaking tokens', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const auth = new AuthClient(async (path, init) => {
    calls.push({ path, init });
    if (path.endsWith('/auth/refresh'))
      return json({ accessToken: 'memory-only', expiresIn: 600 });
    if (path.includes('/moderation/listings?'))
      return json({
        items: [],
        page: { hasNextPage: false, nextCursor: null },
      });
    return json(
      {
        id: 'listing',
        type: 'VEHICLE',
        title: 'Example',
        status: 'PUBLISHED',
        version: 8,
      },
      { etag: '"8"' },
    );
  });
  const api = new WorkspaceApi(auth);
  await api.listingQueue({ type: 'PART', cursor: 'opaque.cursor' });
  await api.listingAction('listing', 'approve', '"7"', {});
  const queue = calls.find((call) =>
    call.path.includes('moderation/listings?'),
  );
  assert.ok(queue);
  assert.match(queue.path, /type=PART/);
  assert.match(queue.path, /cursor=opaque.cursor/);
  const action = calls.at(-1);
  assert.ok(action);
  assert.equal(new Headers(action.init?.headers).get('if-match'), '"7"');
  assert.equal(
    new Headers(action.init?.headers).get('authorization'),
    'Bearer memory-only',
  );
  assert.equal(JSON.stringify(calls).includes('password'), false);
});

test('report/admin clients preserve cursors, filters, cancellation and explicit mutation bodies', async () => {
  const reportId = '10000000-0000-4000-8000-000000000001';
  const userId = '20000000-0000-4000-8000-000000000002';
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const auth = new AuthClient(async (path, init) => {
    calls.push({ path, init });
    if (path.endsWith('/auth/refresh'))
      return json({ accessToken: 'workspace-token', expiresIn: 600 });
    return json({
      items: [],
      page: { hasNextPage: false, nextCursor: null },
      id: 'resource',
      status: 'ACTIVE',
      roles: ['USER'],
    });
  });
  const api = new WorkspaceApi(auth);
  const controller = new AbortController();
  await api.reportQueue(
    {
      status: 'OPEN',
      targetType: 'MESSAGE',
      cursor: 'signed cursor',
      limit: '20',
    },
    controller.signal,
  );
  await api.resolveReport(reportId, {
    outcome: 'RESOLVED',
    resolution: 'WARNING',
    note: 'Reviewed',
  });
  await api.users(
    { status: 'SUSPENDED', role: 'MODERATOR', email: 'a+b@example.test' },
    controller.signal,
  );
  await api.userStatus(userId, 'block', {
    expectedStatus: 'ACTIVE',
    reasonCode: 'FRAUD_RISK',
    note: 'Reviewed',
  });
  await api.roles(userId, ['USER', 'MODERATOR'], ['USER']);
  await api.audit(
    { action: 'USER_BLOCKED', targetType: 'USER', cursor: 'audit cursor' },
    controller.signal,
  );
  controller.abort('test cancellation');

  const reportQueue = calls.find((call) =>
    call.path.includes('moderation/reports?'),
  );
  assert.ok(reportQueue);
  assert.match(reportQueue.path, /targetType=MESSAGE/);
  assert.match(reportQueue.path, /cursor=signed\+cursor/);
  assert.equal(reportQueue.init?.signal?.aborted, true);
  const reportMutation = calls.find((call) =>
    call.path.endsWith(`moderation/reports/${reportId}/resolve`),
  );
  assert.equal(reportMutation?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(reportMutation?.init?.body)), {
    outcome: 'RESOLVED',
    resolution: 'WARNING',
    note: 'Reviewed',
  });
  const users = calls.find((call) => call.path.includes('admin/users?'));
  assert.ok(users);
  assert.match(users.path, /email=a%2Bb%40example.test/);
  assert.equal(users.init?.signal?.aborted, true);
  const block = calls.find((call) => call.path.endsWith('/block'));
  assert.equal(block?.init?.method, 'POST');
  const roles = calls.find((call) => call.path.endsWith('/roles'));
  assert.equal(roles?.init?.method, 'PUT');
  assert.deepEqual(JSON.parse(String(roles?.init?.body)), {
    roles: ['USER', 'MODERATOR'],
    expectedRoles: ['USER'],
  });
  const audit = calls.find((call) => call.path.includes('admin/audit?'));
  assert.ok(audit);
  assert.match(audit.path, /cursor=audit\+cursor/);
  assert.equal(audit.init?.signal?.aborted, true);
});
