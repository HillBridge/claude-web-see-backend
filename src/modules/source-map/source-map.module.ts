import { Module } from '@nestjs/common';
import { SourceMapService } from './source-map.service';
import { SourceMapController } from './source-map.controller';

@Module({
  providers: [SourceMapService],
  controllers: [SourceMapController],
})
export class SourceMapModule {}
