import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { HttpExceptionFilter }    from './common/filters/http-exception.filter';
import { TransformInterceptor }   from './common/interceptors/transform.interceptor';
import { LoggingInterceptor }     from './common/interceptors/logging.interceptor';
import { JwtAuthGuard }           from './common/guards/jwt-auth.guard';
import { RolesGuard }             from './common/guards/roles.guard';
import { PrismaModule }           from './prisma/prisma.module';
import { LoggerModule }           from './logger/logger.module';
import {
  AuthModule,
  UsersModule,
  ProjectsModule,
  ReportModule,
  ErrorsModule,
  PerformanceModule,
  RecordScreenModule,
  WhiteScreenModule,
  SourceMapModule,
} from './modules';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    }),
    LoggerModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    ReportModule,
    ErrorsModule,
    PerformanceModule,
    RecordScreenModule,
    WhiteScreenModule,
    SourceMapModule,
  ],
  providers: [
    { provide: APP_GUARD,       useClass: JwtAuthGuard },         // 1. 先验证 JWT
    { provide: APP_GUARD,       useClass: RolesGuard },           // 2. 再检查角色
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor }, // 统一响应格式
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },   // 请求日志
    { provide: APP_FILTER,      useClass: HttpExceptionFilter },  // 全局异常处理
  ],
})
export class AppModule {}
