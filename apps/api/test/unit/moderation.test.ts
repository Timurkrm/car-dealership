import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ApiException } from '../../src/platform/http/api-error';
import { OpaqueCursor } from '../../src/platform/http/opaque-cursor';
import { testConfig } from '../fixtures';
import {
  finalReportStatus,
  nextModerationListingStatus,
  reportReasonApplies,
} from '../../src/modules/moderation/domain/moderation-policy';
import { assertModerator } from '../../src/modules/moderation/application/moderation-auth';
import {
  CreateReportInput,
  RejectListingInput,
  ResolveReportInput,
} from '../../src/modules/moderation/http/moderation.dto';
import {
  canonicalRoles,
  nextAccountStatus,
  sameRoles,
} from '../../src/modules/admin/domain/administration-policy';

test('listing moderation state machine permits only review decisions and explicit published removal', () => {
  assert.equal(
    nextModerationListingStatus('PENDING_MODERATION', 'approve'),
    'PUBLISHED',
  );
  assert.equal(
    nextModerationListingStatus('PENDING_MODERATION', 'reject'),
    'REJECTED',
  );
  assert.equal(nextModerationListingStatus('PUBLISHED', 'remove'), 'ARCHIVED');
  for (const [status, command] of [
    ['DRAFT', 'approve'],
    ['REJECTED', 'reject'],
    ['ARCHIVED', 'remove'],
  ] as const)
    assert.throws(
      () => nextModerationListingStatus(status, command),
      (error: unknown) =>
        error instanceof ApiException &&
        error.code === 'MODERATION_INVALID_STATE',
    );
});

test('moderator authorization keeps USER out and accepts MODERATOR or ADMIN', () => {
  assert.throws(
    () => assertModerator({ userId: 'u', sessionId: 's', roles: ['USER'] }),
    (error: unknown) =>
      error instanceof ApiException && error.getStatus() === 403,
  );
  assert.doesNotThrow(() =>
    assertModerator({
      userId: 'm',
      sessionId: 's',
      roles: ['USER', 'MODERATOR'],
    }),
  );
  assert.doesNotThrow(() =>
    assertModerator({ userId: 'a', sessionId: 's', roles: ['USER', 'ADMIN'] }),
  );
});

test('rejection and report DTOs reject unstructured codes, empty text and HTML control characters', () => {
  const rejection = plainToInstance(RejectListingInput, {
    reasonCode: 'INVALID_PHOTOS',
    sellerMessage: '  Добавьте чёткие фотографии.  ',
    internalNote: 'internal',
  });
  assert.equal(validateSync(rejection).length, 0);
  assert.equal(rejection.sellerMessage, 'Добавьте чёткие фотографии.');
  for (const value of [
    { reasonCode: 'FREE_TEXT', sellerMessage: 'message' },
    { reasonCode: 'OTHER', sellerMessage: '' },
    { reasonCode: 'OTHER', sellerMessage: 'bad\u0000text' },
  ])
    assert.notEqual(
      validateSync(plainToInstance(RejectListingInput, value)).length,
      0,
    );
  assert.equal(
    validateSync(
      plainToInstance(CreateReportInput, {
        targetType: 'LISTING',
        targetId: '60000000-0000-4000-8000-000000000001',
        reason: 'SCAM',
      }),
    ).length,
    0,
  );
});

test('report reason matrix and final lifecycle are explicit', () => {
  assert.equal(reportReasonApplies('LISTING', 'WRONG_CATEGORY'), true);
  assert.equal(reportReasonApplies('MESSAGE', 'WRONG_CATEGORY'), false);
  assert.equal(reportReasonApplies('MESSAGE', 'HARASSMENT'), true);
  assert.equal(finalReportStatus('OPEN', 'RESOLVED'), 'RESOLVED');
  assert.equal(finalReportStatus('IN_REVIEW', 'DISMISSED'), 'DISMISSED');
  assert.throws(() => finalReportStatus('RESOLVED', 'DISMISSED'), ApiException);
  const removal = plainToInstance(ResolveReportInput, {
    outcome: 'RESOLVED',
    resolution: 'CONTENT_REMOVED',
  });
  assert.notEqual(validateSync(removal).length, 0);
});

test('account transitions cannot bypass verification and roles retain USER', () => {
  assert.equal(nextAccountStatus('ACTIVE', 'suspend'), 'SUSPENDED');
  assert.equal(nextAccountStatus('SUSPENDED', 'block'), 'BLOCKED');
  assert.equal(nextAccountStatus('BLOCKED', 'reactivate'), 'ACTIVE');
  assert.throws(
    () => nextAccountStatus('PENDING_VERIFICATION', 'reactivate'),
    (error: unknown) =>
      error instanceof ApiException &&
      error.code === 'USER_STATUS_TRANSITION_INVALID',
  );
  assert.deepEqual(canonicalRoles(['ADMIN', 'USER', 'MODERATOR']), [
    'USER',
    'MODERATOR',
    'ADMIN',
  ]);
  assert.equal(sameRoles(['ADMIN', 'USER'], ['USER', 'ADMIN']), true);
  assert.throws(() => canonicalRoles(['ADMIN']), ApiException);
});

test('opaque cursor is signed, scoped, expiring and query-bound', () => {
  const cursors = new OpaqueCursor(testConfig());
  const cursor = cursors.encode('moderation-listings', 'filter-a', {
    submittedAt: '2026-09-20T00:00:00.000Z',
    id: '60000000-0000-4000-8000-000000000001',
  });
  assert.deepEqual(cursors.decode(cursor, 'moderation-listings', 'filter-a'), {
    submittedAt: '2026-09-20T00:00:00.000Z',
    id: '60000000-0000-4000-8000-000000000001',
  });
  assert.throws(
    () => cursors.decode(cursor, 'moderation-listings', 'filter-b'),
    (error: unknown) =>
      error instanceof ApiException && error.code === 'CURSOR_QUERY_MISMATCH',
  );
  assert.throws(
    () =>
      cursors.decode(
        `${cursor.slice(0, -1)}${cursor.endsWith('A') ? 'B' : 'A'}`,
        'moderation-listings',
        'filter-a',
      ),
    (error: unknown) =>
      error instanceof ApiException && error.code === 'INVALID_CURSOR',
  );
});
