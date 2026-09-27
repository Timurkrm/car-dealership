import type { SearchItem, SearchPage } from './search-client';
import type { SearchParameters } from './search-parameters';

export interface SearchSessionState {
  key: string;
  items: SearchItem[];
  nextCursor: string | null;
  loading: boolean;
  error: unknown;
}
const INITIAL: SearchSessionState = {
  key: '',
  items: [],
  nextCursor: null,
  loading: true,
  error: null,
};
/** The UI and tests use this same cancellation/keyset coordinator. No browser persistence. */
export class SearchSession {
  private state = INITIAL;
  private controller?: AbortController;
  private epoch = 0;
  private parameters: SearchParameters = {};
  private listeners = new Set<() => void>();
  constructor(
    private readonly load: (
      parameters: SearchParameters,
      cursor: string | undefined,
      signal: AbortSignal,
    ) => Promise<SearchPage>,
  ) {}
  snapshot = () => this.state;
  serverSnapshot = () => INITIAL;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  reset(key: string, parameters: SearchParameters): Promise<void> {
    this.parameters = parameters;
    this.controller?.abort();
    this.epoch++;
    this.update({
      key,
      items: [],
      nextCursor: null,
      loading: true,
      error: null,
    });
    return this.request(undefined, false);
  }
  loadMore(): Promise<void> {
    if (this.state.loading || !this.state.nextCursor) return Promise.resolve();
    return this.request(this.state.nextCursor, true);
  }
  dispose(): void {
    this.controller?.abort();
    this.epoch++;
  }
  private async request(
    cursor: string | undefined,
    append: boolean,
  ): Promise<void> {
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controller = controller;
    this.update({ ...this.state, loading: true, error: null });
    try {
      const page = await this.load(this.parameters, cursor, controller.signal);
      if (controller.signal.aborted || epoch !== this.epoch) return;
      const previous = append ? this.state.items : [];
      const seen = new Set(previous.map((item) => item.id));
      this.update({
        ...this.state,
        items: [
          ...previous,
          ...page.items.filter((item) => !seen.has(item.id)),
        ],
        nextCursor: page.page.nextCursor,
        loading: false,
        error: null,
      });
    } catch (error: unknown) {
      if (!controller.signal.aborted && epoch === this.epoch)
        this.update({ ...this.state, loading: false, error });
    }
  }
  private update(state: SearchSessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
