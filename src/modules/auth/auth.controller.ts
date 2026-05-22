import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: '用户注册' })
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: '用户登录 — 返回 JWT Token' })
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Body() _dto: LoginDto, @Request() req: any) {
    // LocalAuthGuard 已经把验证通过的 user 挂在 req.user 上
    return this.authService.login(req.user);
  }

  @ApiOperation({ summary: '登出 — 使当前 Token 立即失效' })
  @ApiBearerAuth()
  @Post('logout')
  logout(@CurrentUser() user: any) {
    return this.authService.logout(user.id, user.jti);
  }

  @ApiOperation({ summary: '强制下线指定用户（仅管理员）' })
  @ApiBearerAuth()
  @Roles('admin')
  @Post('force-logout/:userId')
  forceLogout(@Param('userId', ParseIntPipe) userId: number) {
    return this.authService.forceLogout(userId);
  }

  @ApiOperation({ summary: '获取当前登录用户信息' })
  @ApiBearerAuth()
  @Get('profile')
  profile(@CurrentUser() user: any) {
    return user;
  }
}
