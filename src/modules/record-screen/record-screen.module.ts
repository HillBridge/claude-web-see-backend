import { Module } from '@nestjs/common';
import { RecordScreenService } from './record-screen.service';
import { RecordScreenController } from './record-screen.controller';

@Module({
  providers: [RecordScreenService],
  controllers: [RecordScreenController],
})
export class RecordScreenModule {}
