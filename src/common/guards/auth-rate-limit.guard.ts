import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const WINDOW_SECONDS = 60;
const MAX_LOGIN_PER_IP = 5;

@Injectable()
export class AuthRateLimitGuard {
  constructor(private redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    // 默认使用 TCP 连接的真实来源 IP(攻击者无法伪造);
    // 仅当显式设置 TRUST_PROXY=true(部署在可信反代后且由反代覆写 XFF)时才采信 X-Forwarded-For,
    // 否则攻击者可每请求伪造一个 XFF 来绕过登录限流(暴力破解防护失效)。
    const trustProxy = process.env.TRUST_PROXY === 'true';
    const raw: string =
      (trustProxy
        ? req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        : undefined) ||
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
