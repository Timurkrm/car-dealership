import { ApiClient } from '../../lib/api-client';

export async function ApiStatus({ apiUrl }: { apiUrl: string }) {
  let available: boolean;
  try {
    await new ApiClient(apiUrl).health();
    available = true;
  } catch {
    available = false;
  }
  return <p role="status">API: {available ? 'available' : 'unavailable'}</p>;
}
