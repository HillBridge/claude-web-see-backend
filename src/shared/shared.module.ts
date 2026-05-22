import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { LoggerModule } from './logger/logger.module';

@Module({
  imports: [PrismaModule, LoggerModule],
  exports: [PrismaModule, LoggerModule],
})
export class SharedModule {}
