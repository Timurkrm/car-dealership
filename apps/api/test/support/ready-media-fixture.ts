import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
/** Persistence-only fixture for listing tests; real storage/decoding is covered by media integration. */
export async function seedReadyPhoto(source: DataSource, listingId: string) {
  const id = randomUUID();
  await source.query(
    "INSERT INTO listing_media(id,listing_id,storage_key,sort_order,is_primary,status,width,height) VALUES ($1,$2,$3,0,true,'READY',60,40)",
    [id, listingId, `media/${id}/source/fixture`],
  );
  for (const kind of ['thumbnail', 'medium', 'large'])
    await source.query(
      'INSERT INTO listing_media_variants(media_id,kind,storage_key,width,height,size) VALUES ($1,$2,$3,60,40,100)',
      [id, kind, `media/${id}/variants/fixture/${kind}.webp`],
    );
}
