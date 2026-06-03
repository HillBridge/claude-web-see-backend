import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const WINDOW_SECONDS = 60;
const MAX_PER_APIKEY = 500;   // 每个项目每分钟
const MAX_PER_IP = 120;        // 每个 IP 每分钟

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const apikey: string = req.body?.apikey ?? 'unknown';

    // 默认使用 TCP 连接的真实来源 IP(攻击者无法伪造);
    // 仅当显式设置 TRUST_PROXY=true(部署在可信反代后且由反代覆写 XFF)时才采信 X-Forwarded-For,
    // 否则攻击者可每请求伪造一个 XFF 来绕过 per-IP 限流。
    const trustProxy = process.env.TRUST_PROXY === 'true';
    const raw: string =
      (trustProxy
        ? req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        : undefined) ||
      req.socket.remoteAddress ||
      'unknown';
    const ip = raw === '::1' ? '127.0.0.1'
      : raw.startsWith('::ffff:') ? raw.slice(7)
      : raw;

    await this.check(`ratelimit:apikey:${apikey}`, MAX_PER_APIKEY);
    await this.check(`ratelimit:ip:${ip}`, MAX_PER_IP);

    return true;
  }

  private async check(key: string, max: number): Promise<void> {
    const client = this.redis.redisClient;
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, WINDOW_SECONDS);
    if (count > max) {
      throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
