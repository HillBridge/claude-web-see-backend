import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  get redisClient(): Redis {
    return this.client;
  }

  async addToken(userId: number, jti: string, ttlSeconds: number): Promise<void> {
    await this.client.set(`auth:token:${userId}:${jti}`, '1', 'EX', ttlSeconds);
  }

  async hasToken(userId: number, jti: string): Promise<boolean> {
    const val = await this.client.exists(`auth:token:${userId}:${jti}`);
    return val === 1;
  }

  async removeToken(userId: number, jti: string): Promise<void> {
    await this.client.del(`auth:token:${userId}:${jti}`);
  }

  async removeAllUserTokens(userId: number): Promise<void> {
    const pattern = `auth:token:${userId}:*`;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }
}
