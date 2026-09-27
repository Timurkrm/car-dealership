import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { Server, ServerOptions } from 'socket.io';
import type { AppConfig } from '../../config/config';
import type { StructuredLogger } from '../logging/structured-logger';

export class RealtimeIoAdapter extends IoAdapter {
  private readonly publisher;
  private readonly subscriber;
  private adapter?: ReturnType<typeof createAdapter>;
  private server?: Server;
  private closing = false;

  constructor(
    app: INestApplicationContext,
    config: AppConfig,
    private readonly logger: StructuredLogger,
  ) {
    super(app);
    const options = {
      socket: {
        host: config.redis.host,
        port: config.redis.port,
        ...(config.redis.tls
          ? { tls: true as const, rejectUnauthorized: true }
          : { tls: false as const }),
        connectTimeout: 3000,
        reconnectStrategy: (retries: number) =>
          Math.min(100 * 2 ** Math.min(retries, 5), 3000),
      },
      password: config.redis.password,
      disableOfflineQueue: true,
    };
    this.publisher = createClient(options);
    this.subscriber = this.publisher.duplicate();
    this.publisher.on('error', () => this.redisWarning());
    this.subscriber.on('error', () => this.redisWarning());
  }

  async connect(): Promise<boolean> {
    const connecting = Promise.all([
      this.publisher.connect(),
      this.subscriber.connect(),
    ])
      .then(() => {
        if (this.closing) {
          if (this.publisher.isOpen) this.publisher.destroy();
          if (this.subscriber.isOpen) this.subscriber.destroy();
          return false;
        }
        this.adapter = createAdapter(this.publisher, this.subscriber);
        this.applyAdapter();
        return true;
      })
      .catch(() => {
        this.redisWarning();
        return false;
      });
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        connecting,
        new Promise<false>((resolve) => {
          timer = setTimeout(() => {
            this.redisWarning();
            resolve(false);
          }, 3000);
          timer.unref();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server: Server = super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      serveClient: false,
      maxHttpBufferSize: 32 * 1024,
    });
    this.server = server;
    this.applyAdapter();
    return server;
  }

  override async close(
    server: Parameters<IoAdapter['close']>[0],
  ): Promise<void> {
    if (!this.closing) {
      this.closing = true;
      if (this.publisher.isOpen) this.publisher.destroy();
      if (this.subscriber.isOpen) this.subscriber.destroy();
    }
    await super.close(server);
  }

  private applyAdapter(): void {
    if (this.server && this.adapter) this.server.adapter(this.adapter);
  }

  private redisWarning(): void {
    this.logger.event('warn', 'Realtime Redis adapter unavailable', {
      operation: 'realtime_redis_adapter',
    });
  }
}
