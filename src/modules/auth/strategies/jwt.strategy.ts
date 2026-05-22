import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { IJwtPayload } from '@/common/interfaces/jwt-payload.interface';
import { UsersService } from '../../users/users.service';
import { RedisService } from '@/common/redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
    private redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: IJwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('用户不存在或已被删除');

    const isValid = await this.redisService.hasToken(user.id, payload.jti);
    if (!isValid) {
      throw new UnauthorizedException('Token 已失效，请重新登录');
    }

    return { id: user.id, username: user.username, role: user.role, jti: payload.jti };
  }
}
