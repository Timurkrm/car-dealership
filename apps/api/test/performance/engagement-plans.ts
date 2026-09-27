import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { createSchemaDatabase } from '../support/schema-database';
import { matchesSavedSearch } from '../../src/modules/search/application/saved-search-matcher';
import { parseSavedSearchFilters } from '../../src/modules/search';
import type {
  ListingMatchingSnapshot,
  PartMatchingSnapshot,
} from '../../src/modules/search/application/saved-search-matcher';

interface ExplainNode {
  'Node Type'?: string;
  'Index Name'?: string;
  'Actual Rows'?: number;
  Plans?: ExplainNode[];
}
function indexes(node: ExplainNode): string[] {
  return [
    ...(node['Index Name'] ? [node['Index Name']] : []),
    ...(node.Plans ?? []).flatMap(indexes),
  ];
}

async function main() {
  const database = await createSchemaDatabase();
  const { source } = database;
  try {
    await source.runMigrations();
    const users = 10000,
      listings = 30000,
      searches = 30000,
      notifications = 30000,
      outbox = 30000;
    await source.query(
      `INSERT INTO users(id,email_normalized,display_name,status,email_verified_at)
      SELECT md5('eng-user-'||n)::uuid,'eng-'||n||'@example.test','Engagement user '||n,'ACTIVE',CURRENT_TIMESTAMP FROM generate_series(1,$1) n`,
      [users],
    );
    await source.query(
      `INSERT INTO listings(id,seller_id,type,title,description,price_minor,currency,status)
      SELECT md5('eng-listing-'||n)::uuid,md5('eng-user-1')::uuid,CASE WHEN n%4=0 THEN 'PART' ELSE 'VEHICLE' END,
      'Plan listing '||n,'Performance fixture',10000+n,'EUR','DRAFT' FROM generate_series(1,$1) n`,
      [listings],
    );
    await source.query(`INSERT INTO favorites(user_id,listing_id,listing_type,created_at)
      SELECT md5('eng-user-2')::uuid,id,type,'2026-01-01'::timestamptz + row_number() OVER (ORDER BY id)*interval '1 second' FROM listings`);
    await source.query(
      `INSERT INTO saved_searches(user_id,name,filters,listing_type,filter_fingerprint,schema_version,notifications_enabled,created_at,updated_at)
      SELECT md5('eng-user-'||(2+(n%9999)))::uuid,'Search '||n,
      CASE WHEN n%4=0
        THEN jsonb_build_object('condition',CASE WHEN n%2=0 THEN 'NEW' ELSE 'USED' END)
        ELSE jsonb_build_object('color',CASE WHEN n%2=0 THEN 'BLUE' ELSE 'BLACK' END)
      END,
      CASE WHEN n%4=0 THEN 'PART' ELSE 'VEHICLE' END,md5('fingerprint-'||n)||md5('fingerprint-tail-'||n),2,n%3<>0,
      '2026-01-01'::timestamptz+n*interval '1 second','2026-01-01'::timestamptz+n*interval '1 second'
      FROM generate_series(1,$1) n`,
      [searches],
    );
    await source.query(
      `INSERT INTO notifications(id,user_id,type,payload,read_at,created_at)
      SELECT md5('eng-notification-'||n)::uuid,md5('eng-user-'||(2+(n%100)))::uuid,'ACCOUNT_STATUS_CHANGED',
      '{"schemaVersion":1,"accountStatus":"ACTIVE","reasonCode":"PLAN"}'::jsonb,
      CASE WHEN n%2=0 THEN '2026-02-01'::timestamptz+n*interval '1 second' END,
      '2026-01-01'::timestamptz+n*interval '1 second' FROM generate_series(1,$1) n`,
      [notifications],
    );
    await source.query(
      `INSERT INTO outbox_events(id,type,aggregate_type,aggregate_id,payload,occurred_at,status,attempts,available_at,processed_at,created_at)
      SELECT md5('eng-event-'||n)::uuid,'LISTING_ARCHIVED','LISTING',md5('eng-listing-'||(1+n%$2))::uuid,'{}'::jsonb,
      '2026-03-01'::timestamptz+n*interval '1 second',CASE WHEN n<=500 THEN 'PENDING' ELSE 'PROCESSED' END,0,
      '2026-03-01'::timestamptz+n*interval '1 second',CASE WHEN n>500 THEN '2026-03-02'::timestamptz END,
      '2026-03-01'::timestamptz+n*interval '1 second' FROM generate_series(1,$1) n`,
      [outbox, listings],
    );
    await source.query('ANALYZE');

    const cases = [
      {
        name: 'favorites list',
        index: 'ix_favorites_user_created',
        sql: `SELECT listing_id FROM favorites WHERE user_id=md5('eng-user-2')::uuid ORDER BY created_at DESC,listing_id DESC LIMIT 20`,
      },
      {
        name: 'saved search candidates',
        index: 'ix_saved_searches_enabled_type',
        sql: `SELECT id,user_id,filters FROM saved_searches WHERE notifications_enabled=true AND listing_type='VEHICLE' ORDER BY id LIMIT 200`,
      },
      {
        name: 'notification unread',
        index: 'ix_notifications_user_unread',
        sql: `SELECT count(*) FROM notifications WHERE user_id=md5('eng-user-2')::uuid AND read_at IS NULL`,
      },
      {
        name: 'notification list',
        index: 'ix_notifications_user_created',
        sql: `SELECT id FROM notifications WHERE user_id=md5('eng-user-2')::uuid ORDER BY created_at DESC,id DESC LIMIT 20`,
      },
      {
        name: 'outbox claim candidates',
        index: 'ix_outbox_events_claim',
        sql: `SELECT id FROM outbox_events WHERE status IN ('PENDING','RETRY') AND available_at<='2100-01-01' ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 50`,
      },
    ];
    const results = [];
    for (const item of cases) {
      const rows = await source.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${item.sql}`,
      );
      const document = rows[0]?.['QUERY PLAN']?.[0];
      assert.ok(document);
      const selected = indexes(document.Plan);
      assert.ok(
        selected.includes(item.index),
        `${item.name}: ${selected.join(', ')}`,
      );
      results.push({
        query: item.name,
        rows: document.Plan['Actual Rows'],
        executionMs: document['Execution Time'],
        indexes: selected,
      });
    }

    const selectionStarted = performance.now();
    const vehicleCandidates: {
      user_id: string;
      filters: Record<string, string>;
    }[] = await source.query(
      "SELECT user_id,filters FROM saved_searches WHERE notifications_enabled=true AND listing_type='VEHICLE' ORDER BY id",
    );
    const partCandidates: {
      user_id: string;
      filters: Record<string, string>;
    }[] = await source.query(
      "SELECT user_id,filters FROM saved_searches WHERE notifications_enabled=true AND listing_type='PART' ORDER BY id",
    );
    const selectionMs = performance.now() - selectionStarted;
    const vehicle = vehicleSnapshot();
    const part = partSnapshot();
    const matchStarted = performance.now();
    const vehicleRecipients = new Set(
      vehicleCandidates
        .filter((row) =>
          matchesSavedSearch(
            parseSavedSearchFilters('VEHICLE', row.filters).query,
            vehicle,
          ),
        )
        .map((row) => row.user_id),
    );
    const partRecipients = new Set(
      partCandidates
        .filter((row) =>
          matchesSavedSearch(
            parseSavedSearchFilters('PART', row.filters).query,
            part,
          ),
        )
        .map((row) => row.user_id),
    );
    const matchingMs = performance.now() - matchStarted;
    const vehicleEventId = md5Uuid('engagement-benchmark-vehicle-event');
    const partEventId = md5Uuid('engagement-benchmark-part-event');
    await source.query(
      "INSERT INTO outbox_events(id,type,aggregate_type,aggregate_id,payload,occurred_at,status,attempts,available_at,locked_at) VALUES ($1,'LISTING_PUBLISHED','LISTING',$2,'{}',CURRENT_TIMESTAMP,'PROCESSING',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),($3,'LISTING_PUBLISHED','LISTING',$4,'{}',CURRENT_TIMESTAMP,'PROCESSING',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
      [vehicleEventId, vehicle.id, partEventId, part.id],
    );
    const insertStarted = performance.now();
    if (vehicleRecipients.size)
      await source.query(
        `INSERT INTO notifications(user_id,type,payload,source_event_id)
        SELECT recipient::uuid,'SAVED_SEARCH_MATCH',$2::jsonb,$3::uuid FROM unnest($1::text[]) recipient ON CONFLICT DO NOTHING`,
        [
          [...vehicleRecipients],
          JSON.stringify({
            schemaVersion: 1,
            listingId: vehicle.id,
            listingType: 'VEHICLE',
          }),
          vehicleEventId,
        ],
      );
    if (partRecipients.size)
      await source.query(
        `INSERT INTO notifications(user_id,type,payload,source_event_id)
        SELECT recipient::uuid,'SAVED_SEARCH_MATCH',$2::jsonb,$3::uuid FROM unnest($1::text[]) recipient ON CONFLICT DO NOTHING`,
        [
          [...partRecipients],
          JSON.stringify({
            schemaVersion: 1,
            listingId: part.id,
            listingType: 'PART',
          }),
          partEventId,
        ],
      );
    const insertMs = performance.now() - insertStarted;
    process.stdout.write(
      `${JSON.stringify({ dataset: { users, listings, favorites: listings, savedSearches: searches, savedSearchEnabled: vehicleCandidates.length + partCandidates.length, notifications, outbox }, results, matchingBenchmark: { vehicleCandidates: vehicleCandidates.length, partCandidates: partCandidates.length, matchedVehicleRecipients: vehicleRecipients.size, matchedPartRecipients: partRecipients.size, candidateSelectionMs: Number(selectionMs.toFixed(3)), matchingMs: Number(matchingMs.toFixed(3)), insertMs: Number(insertMs.toFixed(3)) } }, null, 2)}\n`,
    );
  } finally {
    await database.close();
  }
}

function md5Uuid(value: string): string {
  return createHash('md5')
    .update(value)
    .digest('hex')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}
function vehicleSnapshot(): ListingMatchingSnapshot {
  return {
    id: '60000000-0000-4000-8000-000000000001',
    type: 'VEHICLE',
    sellerId: '70000000-0000-4000-8000-000000000001',
    title: 'Blue car',
    priceMinor: '2500000',
    currency: 'EUR',
    publishedAt: '2026-01-01T00:00:00Z',
    city: 'City',
    region: null,
    countryCode: 'NL',
    publicLatitude: null,
    publicLongitude: null,
    exactLatitude: 52,
    exactLongitude: 4,
    distance: null,
    thumbnailKey: 'key',
    thumbnailWidth: 320,
    thumbnailHeight: 240,
    makeId: '10000000-0000-4000-8000-000000000001',
    makeName: 'Make',
    modelId: '20000000-0000-4000-8000-000000000001',
    modelName: 'Model',
    generationId: null,
    generationName: null,
    year: 2022,
    mileageKm: 10000,
    bodyType: 'SEDAN',
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    driveType: 'RWD',
    condition: 'USED',
    color: 'BLUE',
  };
}

function partSnapshot(): PartMatchingSnapshot {
  return {
    id: '60000000-0000-4000-8000-000000000002',
    type: 'PART',
    sellerId: '70000000-0000-4000-8000-000000000001',
    title: 'New replacement part',
    priceMinor: '50000',
    currency: 'EUR',
    publishedAt: '2026-01-01T00:00:00Z',
    city: 'City',
    region: null,
    countryCode: 'NL',
    publicLatitude: null,
    publicLongitude: null,
    exactLatitude: 52,
    exactLongitude: 4,
    distance: null,
    thumbnailKey: 'part-key',
    thumbnailWidth: 320,
    thumbnailHeight: 240,
    partId: '80000000-0000-4000-8000-000000000001',
    partName: 'Replacement part',
    partCategoryId: '81000000-0000-4000-8000-000000000001',
    partCategoryName: 'Parts',
    partCategoryParentId: null,
    partBrandId: null,
    partBrandName: null,
    partCondition: 'NEW',
    manufacturerPartNumber: 'MPN-1',
    oemNumber: 'OEM-1',
    fitmentMode: 'UNIVERSAL',
    fitmentCount: 0,
    quantityAvailable: 1,
    categoryAncestorIds: ['81000000-0000-4000-8000-000000000001'],
    fitments: [],
  };
}
void main();
