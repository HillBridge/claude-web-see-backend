import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { RedisService } from '@/common/redis/redis.service';

const JWT_TTL_SECONDS = 7 * 24 * 3600; // 与 JWT_EXPIRES_IN=7d 保持一致

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  /** Local 策略调用: 校验用户名密码 */
  async validateUser(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user) return null;
    const isMatch = await bcrypt.compare(password, user.password);
    return isMatch ? user : null;
  }

  /** 登录 — 颁发 JWT 并写入白名单 */
  async login(user: { id: number; username: string; role: string }) {
    const jti = uuidv4();
    const payload = { sub: user.id, username: user.username, role: user.role, jti };
    const accessToken = this.jwtService.sign(payload);
    await this.redisService.addToken(user.id, jti, JWT_TTL_SECONDS);
    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  }

  /** 登出 — 从白名单移除当前 Token */
  async logout(userId: number, jti: string): Promise<void> {
    await this.redisService.removeToken(userId, jti);
  }

  /** 强制下线 — 移除该用户所有 Token */
  async forceLogout(userId: number): Promise<void> {
    await this.redisService.removeAllUserTokens(userId);
  }

  /** 注册新用户 */
  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByUsername(dto.username);
    if (existingUser) {
      throw new ConflictException('用户名已被占用');
    }
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('邮箱已被注册');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      username: dto.username,
      email: dto.email,
      password: hashed,
    });

    const jti = uuidv4();
    const payload = { sub: user.id, username: user.username, role: user.role, jti };
    const accessToken = this.jwtService.sign(payload);
    await this.redisService.addToken(user.id, jti, JWT_TTL_SECONDS);
    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }
}
