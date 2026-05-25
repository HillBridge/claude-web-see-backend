import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const WINDOW_SECONDS = 60;
const MAX_LOGIN_PER_IP = 5;

@Injectable()
export class AuthRateLimitGuard {
  constructor(private redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const raw: string =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const ip =
      raw === '::1' ? '127.0.0.1'
      : raw.startsWith('::ffff:') ? raw.slice(7)
      : raw;

    const key = `ratelimit:auth:${ip}`;
    const client = this.redis.redisClient;
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, WINDOW_SECONDS);
    if (count > MAX_LOGIN_PER_IP) {
      throw new HttpException('登录尝试过于频繁，请 1 分钟后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
