import type { Fitment, PublicListing, PublicPartListing } from '../listings/listing-types';
import type { Photo } from '../media/media-client';

export type PublicDetail = PublicListing | PublicPartListing;
export const detailPath = (listing: Pick<PublicDetail, 'type' | 'id'>) =>
  `${listing.type === 'PART' ? '/parts' : '/listings'}/${listing.id}`;

export function galleryPhotos(photos: readonly Photo[]) {
  return photos.filter((photo) => photo.status === 'READY' && photo.variants)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function groupedFitments(rows: readonly Fitment[]) {
  const makes = new Map<string, { name: string; models: Map<string, { name: string; scopes: Fitment[] }> }>();
  for (const row of rows) {
    let make = makes.get(row.make.id);
    if (!make) { make = { name: row.make.name, models: new Map() }; makes.set(row.make.id, make); }
    let model = make.models.get(row.model.id);
    if (!model) { model = { name: row.model.name, scopes: [] }; make.models.set(row.model.id, model); }
    model.scopes.push(row);
  }
  return Array.from(makes, ([id, make]) => ({ id, name: make.name,
    models: Array.from(make.models, ([modelId, model]) => ({ id: modelId, ...model })),
  }));
}
export function fitmentYears(row: Pick<Fitment, 'yearFrom' | 'yearTo'>) {
  if (row.yearFrom !== null && row.yearTo !== null) return `${row.yearFrom}–${row.yearTo}`;
  if (row.yearFrom !== null) return `с ${row.yearFrom}`;
  if (row.yearTo !== null) return `до ${row.yearTo}`;
  return 'Все годы';
}
export function detailMetadata(listing: PublicDetail) {
  const fallback = listing.type === 'PART' ? 'Автомобильная запчасть' : 'Автомобиль';
  return {
    title: `${listing.title} — Automotive Marketplace`,
    description: (listing.description?.replace(/\s+/g, ' ').trim() || `${fallback}: ${listing.title}`).slice(0, 160),
    alternates: { canonical: detailPath(listing) },
  };
}

/** Presentation-only owner comparison. Never an authorization credential.
 * Avoid serializing a seller UUID into server-rendered HTML/client island props. */
export async function sellerMarker(listingId: string, userId: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${listingId}:${userId}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
