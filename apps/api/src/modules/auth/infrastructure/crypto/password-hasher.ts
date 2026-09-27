import { hash, verify, needsRehash, argon2id } from 'argon2';
import type { HashOptions } from 'argon2';
import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ApiException } from '../../../../platform/http/api-error';

export const PASSWORD_HASH_OPTIONS = {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} satisfies HashOptions;

@Injectable()
export class PasswordHasher implements OnModuleInit {
  private active = 0;
  private readonly dummy = hash(
    'non-account timing verification fixture',
    PASSWORD_HASH_OPTIONS,
  );
  async onModuleInit(): Promise<void> {
    await this.dummy;
  }
  private async bounded<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= 4)
      throw new ApiException(
        503,
        'AUTH_BUSY',
        'Authentication temporarily busy',
      );
    this.active++;
    try {
      return await work();
    } finally {
      this.active--;
    }
  }
  hash(password: string): Promise<string> {
    return this.bounded(() => hash(password, PASSWORD_HASH_OPTIONS));
  }
  async verify(encoded: string | null, password: string): Promise<boolean> {
    const usable = encoded?.startsWith('$argon2id$') === true;
    const digest = usable && encoded ? encoded : await this.dummy;
    const valid = await this.bounded(() => verify(digest, password));
    return usable && valid;
  }
  needsRehash(encoded: string): boolean {
    return needsRehash(encoded, PASSWORD_HASH_OPTIONS);
  }
}
