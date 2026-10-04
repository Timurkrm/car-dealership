import type { EngagementClient } from './engagement-client';
export interface FavoriteSnapshot {
  value: boolean | null;
  pending: boolean;
  error: boolean;
}
const UNKNOWN: FavoriteSnapshot = { value: null, pending: false, error: false };
/** In-memory confirmed observations/mutations only. No per-card membership GETs. */
export class FavoriteState {
  private readonly rows = new Map<string, FavoriteSnapshot>();
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly api: Pick<EngagementClient, 'favorite' | 'unfavorite'>,
  ) {}
  read = (id: string): FavoriteSnapshot => this.rows.get(id) ?? UNKNOWN;
  serverSnapshot = (): FavoriteSnapshot => UNKNOWN;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private write(id: string, state: FavoriteSnapshot) {
    this.rows.set(id, state);
    this.listeners.forEach((listener) => listener());
  }
  observe(ids: string[]) {
    for (const id of ids)
      if (!this.read(id).pending)
        this.rows.set(id, { value: true, pending: false, error: false });
    this.listeners.forEach((listener) => listener());
  }
  async set(id: string, value: boolean): Promise<boolean> {
    const before = this.read(id);
    if (before.pending) return false;
    this.write(id, { value, pending: true, error: false });
    try {
      if (value) await this.api.favorite(id);
      else await this.api.unfavorite(id);
      this.write(id, { value, pending: false, error: false });
      return true;
    } catch {
      this.write(id, { value: before.value, pending: false, error: true });
      return false;
    }
  }
}
