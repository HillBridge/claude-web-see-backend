import { Module } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { SharedModule } from '@/shared/shared.module';

@Module({
  imports: [SharedModule],
  providers: [CleanupService],
})
export class CleanupModule {}
