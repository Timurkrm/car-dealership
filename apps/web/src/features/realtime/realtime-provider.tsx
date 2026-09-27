'use client';
import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { useAuth } from '../auth/auth-provider';

type Listener = (payload?: unknown) => void;
type RealtimeSocketFactory = (
  url: string,
  options: NonNullable<Parameters<typeof io>[1]>,
) => Socket;

export class RealtimeClient {
  private socket: Socket | null = null;
  private refreshed = false;
  private readonly local = new Map<string, Set<Listener>>();

  constructor(
    private readonly credential: (force?: boolean) => Promise<string>,
    private readonly socketFactory: RealtimeSocketFactory = io,
  ) {}

  async connect(): Promise<void> {
    if (this.socket) return;
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (!base) return;
    const socket = this.socketFactory(`${base}/realtime`, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
      timeout: 5000,
      auth: (callback) => {
        void this.credential().then(
          (accessToken) => callback({ accessToken }),
          () => callback({}),
        );
      },
    });
    this.socket = socket;
    for (const [event, listeners] of this.local)
      for (const listener of listeners) socket.on(event, listener);
    socket.on('connect', () => {
      this.refreshed = false;
      this.emitLocal('realtime:connected');
    });
    socket.on('connect_error', () => {
      if (this.refreshed) return;
      this.refreshed = true;
      void this.credential(true).then(
        () => socket.connect(),
        () => this.disconnect(),
      );
    });
    socket.on('disconnect', (reason) => {
      // A server-side disconnect is not retried automatically by Socket.IO. It
      // is used for access-token expiry and revoked sessions, so refresh once
      // and re-authenticate with the current persisted session state.
      if (reason !== 'io server disconnect' || this.refreshed) return;
      this.refreshed = true;
      void this.credential(true).then(
        () => socket.connect(),
        () => this.disconnect(),
      );
    });
    socket.connect();
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.refreshed = false;
  }

  on(event: string, listener: Listener): () => void {
    const listeners = this.local.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.local.set(event, listeners);
    this.socket?.on(event, listener);
    return () => {
      listeners.delete(listener);
      this.socket?.off(event, listener);
    };
  }

  command<T>(event: string, payload: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket?.connected) return reject(new Error('REALTIME_UNAVAILABLE'));
      socket
        .timeout(5000)
        .emit(event, payload, (error: Error | null, response: unknown) => {
          if (error) return reject(error);
          if (
            !response ||
            typeof response !== 'object' ||
            !('ok' in response) ||
            response.ok !== true ||
            !('data' in response)
          )
            return reject(new Error('REALTIME_COMMAND_FAILED'));
          resolve(response.data as T);
        });
    });
  }

  private emitLocal(event: string): void {
    this.local.get(event)?.forEach((listener) => listener());
  }
}

const Context = createContext<RealtimeClient | null>(null);
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { client, status } = useAuth();
  const realtime = useMemo(
    () => new RealtimeClient((force) => client.realtimeAccessToken(force)),
    [client],
  );
  useEffect(() => {
    if (status === 'authenticated') void realtime.connect();
    else realtime.disconnect();
    return () => realtime.disconnect();
  }, [realtime, status]);
  return <Context.Provider value={realtime}>{children}</Context.Provider>;
}

export function useRealtime(): RealtimeClient {
  const value = useContext(Context);
  if (!value) throw new Error('RealtimeProvider is required');
  return value;
}
