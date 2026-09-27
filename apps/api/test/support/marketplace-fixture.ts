import type { DataSource } from 'typeorm';
import { seedVehicleCatalog } from '../../src/modules/vehicles/infrastructure/persistence/catalog.seed';
import { User } from '../../src/modules/users/infrastructure/persistence/user.entity';
import { Vehicle } from '../../src/modules/vehicles/infrastructure/persistence/vehicle.entity';
import { Listing } from '../../src/modules/listings/infrastructure/persistence/listing.entity';
import { VehicleListing } from '../../src/modules/listings/infrastructure/persistence/vehicle-listing.entity';

export const fixture = {
  seller: '40000000-0000-4000-8000-000000000001',
  buyer: '40000000-0000-4000-8000-000000000002',
  moderator: '40000000-0000-4000-8000-000000000003',
  model: '20000000-0000-4000-8000-000000000001',
  generation: '30000000-0000-4000-8000-000000000001',
  otherGeneration: '30000000-0000-4000-8000-000000000003',
  vehicles: [
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000003',
  ],
  listings: [
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000003',
  ],
  conversation: '70000000-0000-4000-8000-000000000001',
  message: '80000000-0000-4000-8000-000000000001',
  session: '90000000-0000-4000-8000-000000000001',
  missing: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  createdAt: new Date('2026-01-01T00:00:00Z'),
} as const;

export async function seedMarketplaceFixture(
  source: DataSource,
): Promise<void> {
  await source.transaction(async (manager) => {
    await seedVehicleCatalog(manager);
    for (const [id, name] of [
      [fixture.seller, 'Seller'],
      [fixture.buyer, 'Buyer'],
      [fixture.moderator, 'Moderator'],
    ]) {
      await manager.insert(User, {
        id,
        displayName: name,
        emailNormalized: `${name?.toLowerCase()}@example.test`,
        status: 'ACTIVE',
        createdAt: fixture.createdAt,
      });
    }
    await manager.query(
      'INSERT INTO user_roles(user_id, role) VALUES ($1, $4), ($2, $4), ($3, $4), ($3, $5)',
      [fixture.seller, fixture.buyer, fixture.moderator, 'USER', 'MODERATOR'],
    );
    // Synthetic digest fixture, not a reusable credential or production account.
    await manager.query(
      'INSERT INTO user_credentials(user_id, password_hash) VALUES ($1, $2)',
      [fixture.seller, '$test$nonfunctional-password-digest'],
    );
    await manager.query(
      'INSERT INTO user_sessions(id, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
      [
        fixture.session,
        fixture.seller,
        fixture.createdAt,
        '2100-01-01T00:00:00Z',
      ],
    );
    await manager.query(
      'INSERT INTO session_tokens(session_id, token_hash, created_at, expires_at) VALUES ($1, $2, $3, $4)',
      [
        fixture.session,
        'a'.repeat(64),
        fixture.createdAt,
        '2100-01-01T00:00:00Z',
      ],
    );
    const cities = [
      { name: 'Amsterdam', longitude: 4.9041, latitude: 52.3676 },
      { name: 'Rotterdam', longitude: 4.4777, latitude: 51.9244 },
      { name: 'Utrecht', longitude: 5.1214, latitude: 52.0907 },
    ];
    for (const [index, city] of cities.entries()) {
      const vehicleId = fixture.vehicles[index];
      const listingId = fixture.listings[index];
      if (!vehicleId || !listingId)
        throw new Error('Fixture identifier missing');
      await manager.save(Vehicle, {
        id: vehicleId,
        modelId: fixture.model,
        generationId: index === 2 ? null : fixture.generation,
        year: 2022,
        mileageKm: index * 10000,
        bodyType: 'SEDAN',
        fuelType: 'PETROL',
        transmission: 'AUTOMATIC',
        driveType: 'RWD',
        enginePowerHp: 184,
        engineDisplacementCc: 1998,
        color: 'BLUE',
        vin: 'WBA8A9C50GK123456',
        condition: 'USED',
        createdAt: fixture.createdAt,
      });
      await manager.save(Listing, {
        id: listingId,
        sellerId: fixture.seller,
        type: 'VEHICLE',
        title: `BMW 3 Series — ${city.name}`,
        description: null,
        priceMinor: index === 0 ? '9007199254740993' : '2500000',
        currency: 'EUR',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-01-02T00:00:00Z'),
        createdAt: fixture.createdAt,
      });
      await manager.insert(VehicleListing, { listingId, vehicleId });
      await manager.query(
        'INSERT INTO listing_locations(listing_id, point, city, country_code) VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5)',
        [listingId, city.longitude, city.latitude, city.name, 'NL'],
      );
    }
    await manager.query(
      'INSERT INTO listing_media(listing_id, storage_key, sort_order, is_primary, status) VALUES ($1, $2, 0, true, $3), ($1, $4, 1, false, $3)',
      [
        fixture.listings[0],
        `listings/${fixture.listings[0]}/fixture-1.jpg`,
        'READY',
        `listings/${fixture.listings[0]}/fixture-2.jpg`,
      ],
    );
    await manager.query(
      "INSERT INTO favorites(user_id, listing_id, listing_type) VALUES ($1, $2, 'VEHICLE')",
      [fixture.buyer, fixture.listings[0]],
    );
    await manager.query(
      "INSERT INTO saved_searches(user_id, name, filters, schema_version, listing_type, filter_fingerprint) VALUES ($1, $2, $3, 1, 'VEHICLE', $4)",
      [
        fixture.buyer,
        'BMW near Amsterdam',
        {
          modelIds: [fixture.model],
          currency: 'EUR',
          maxPriceMinor: '3000000',
        },
        'a'.repeat(64),
      ],
    );
    await manager.query(
      'INSERT INTO conversations(id, listing_id, buyer_id, last_message_at) VALUES ($1, $2, $3, $4)',
      [
        fixture.conversation,
        fixture.listings[0],
        fixture.buyer,
        fixture.createdAt,
      ],
    );
    await manager.query(
      'INSERT INTO conversation_participants(conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
      [fixture.conversation, fixture.seller, fixture.buyer],
    );
    await manager.query(
      'INSERT INTO messages(id, conversation_id, sender_id, client_message_id, body) VALUES ($1, $2, $3, $1, $4)',
      [
        fixture.message,
        fixture.conversation,
        fixture.buyer,
        'Is this vehicle available?',
      ],
    );
    await manager.query(
      "INSERT INTO outbox_events(id,type,aggregate_type,aggregate_id,payload,occurred_at,status,available_at) VALUES ($1,'LISTING_PUBLISHED','LISTING',$2,$3,$4,'PENDING',$4)",
      [
        '85000000-0000-4000-8000-000000000001',
        fixture.listings[0],
        {
          schemaVersion: 1,
          listingId: fixture.listings[0],
          listingType: 'VEHICLE',
          sellerId: fixture.seller,
          previousStatus: 'PENDING_MODERATION',
          nextStatus: 'PUBLISHED',
        },
        fixture.createdAt,
      ],
    );
    await manager.query(
      'INSERT INTO notifications(user_id, type, payload) VALUES ($1, $2, $3)',
      [
        fixture.seller,
        'NEW_MESSAGE',
        {
          schemaVersion: 1,
          conversationId: fixture.conversation,
          messageId: fixture.message,
        },
      ],
    );
    await manager.query(
      'INSERT INTO reports(reporter_id, target_type, listing_id, reason_code, reason) VALUES ($1, $2, $3, $4, $5)',
      [
        fixture.buyer,
        'LISTING',
        fixture.listings[0],
        'MISLEADING_INFORMATION',
        'Please review listing information.',
      ],
    );
    await manager.query(
      'INSERT INTO moderation_actions(moderator_id, target_type, listing_id, action, reason_code, internal_note) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        fixture.moderator,
        'LISTING',
        fixture.listings[0],
        'APPROVE_LISTING',
        'APPROVED',
        'Information reviewed.',
      ],
    );
    await manager.query(
      'INSERT INTO audit_logs(actor_user_id, action, target_type, target_id, request_id) VALUES ($1, $2, $3, $4, $5)',
      [
        fixture.moderator,
        'LISTING_APPROVED',
        'LISTING',
        fixture.listings[0],
        'schema-fixture',
      ],
    );
  });
}
