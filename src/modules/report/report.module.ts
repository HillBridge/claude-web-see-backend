import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { SharedModule } from '../../shared/shared.module';
import { ProjectsModule } from '../projects/projects.module';
import { ApiKeyAuthGuard } from '../../common/guards/apikey-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

@Module({
  imports: [SharedModule, ProjectsModule],
  providers: [ReportService, ApiKeyAuthGuard, RateLimitGuard],
  controllers: [ReportController],
  exports: [ReportService],
})
export class ReportModule {}
