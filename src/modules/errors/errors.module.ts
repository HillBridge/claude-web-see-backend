import { Module } from '@nestjs/common';
import { SourceMapModule } from '@/modules/source-map/source-map.module';
import { ErrorsService } from './errors.service';
import { ErrorsController } from './errors.controller';

@Module({
  imports: [SourceMapModule],
  providers: [ErrorsService],
  controllers: [ErrorsController],
})
export class ErrorsModule {}
