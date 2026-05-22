import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async setUserInvalidatedAt(userId: number, timestamp: number, ttlSeconds: number): Promise<void> {
    await this.client.set(`auth:invalidated:${userId}`, timestamp, 'EX', ttlSeconds);
  }

  async getUserInvalidatedAt(userId: number): Promise<number | null> {
    const val = await this.client.get(`auth:invalidated:${userId}`);
    return val ? parseInt(val, 10) : null;
  }
}
