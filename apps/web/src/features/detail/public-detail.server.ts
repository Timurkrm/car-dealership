import 'server-only';
import { cache } from 'react';
import { webConfig } from '../../config';
import { fetchPublicDetail } from './public-detail-resource';

// Metadata and the page share one read per server render. No cross-request cache
// retains signed images or a listing that has subsequently been removed.
export const loadPublicDetail = cache((type: 'VEHICLE' | 'PART', id: string) =>
  fetchPublicDetail(webConfig().apiUrl, type, id));
