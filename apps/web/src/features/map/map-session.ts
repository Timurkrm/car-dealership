import type { MapResponse } from '../search/search-client';

export interface MapSessionState extends MapResponse {
  loading: boolean;
  error: unknown;
  key: string;
}
const INITIAL: MapSessionState = {
  features: [],
  truncated: false,
  limit: 500,
  loading: false,
  error: null,
  key: '',
};

/** Debounces moveend, cancels obsolete fetches and rejects late responses. */
export class MapSession {
  private state = INITIAL;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private epoch = 0;
  private listeners = new Set<() => void>();
  constructor(
    private readonly load: (
      key: string,
      signal: AbortSignal,
    ) => Promise<MapResponse>,
    private readonly delayMs = 225,
  ) {}
  snapshot = () => this.state;
  serverSnapshot = () => INITIAL;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  schedule(key: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.controller?.abort();
    const epoch = ++this.epoch;
    this.update({ ...this.state, key, loading: true, error: null });
    this.timer = setTimeout(() => void this.request(key, epoch), this.delayMs);
  }
  retry(): void {
    if (this.state.key) this.schedule(this.state.key);
  }
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.controller?.abort();
    this.epoch++;
  }
  private async request(key: string, epoch: number) {
    const controller = new AbortController();
    this.controller = controller;
    try {
      const result = await this.load(key, controller.signal);
      if (controller.signal.aborted || epoch !== this.epoch) return;
      this.update({ ...result, key, loading: false, error: null });
    } catch (error: unknown) {
      if (!controller.signal.aborted && epoch === this.epoch)
        this.update({ ...this.state, loading: false, error });
    }
  }
  private update(state: MapSessionState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
