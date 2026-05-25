import { Module } from '@nestjs/common';
import { MinioModule } from '@/shared/minio/minio.module';
import { SourceMapService } from './source-map.service';
import { SourceMapController } from './source-map.controller';

@Module({
  imports: [MinioModule],
  providers: [SourceMapService],
  controllers: [SourceMapController],
})
export class SourceMapModule {}
