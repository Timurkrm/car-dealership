/** Allowlisted machine metadata; never pass request bodies, headers or user text. */
export interface AuditMetadata {
  changedFields?: string[];
  reasonCode?: string;
  previousStatus?: string;
  nextStatus?: string;
  listingType?: 'VEHICLE' | 'PART';
}

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  requestId: string | null;
  metadata?: AuditMetadata;
}

export function validateAuditMetadata(metadata: AuditMetadata): void {
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'changedFields') {
      if (
        !Array.isArray(value) ||
        value.length > 30 ||
        !value.every(
          (field: unknown) =>
            typeof field === 'string' &&
            /^[a-z][a-zA-Z0-9_]{0,63}$/.test(field),
        )
      ) {
        throw new RangeError('Invalid audit field list');
      }
    } else if (
      ['reasonCode', 'previousStatus', 'nextStatus', 'listingType'].includes(
        key,
      )
    ) {
      if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(value)) {
        throw new RangeError('Audit metadata requires machine codes');
      }
    } else {
      throw new RangeError('Unexpected audit metadata field');
    }
  }
}
