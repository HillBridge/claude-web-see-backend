import { Module } from "@nestjs/common";
import { RecordScreenService } from "./record-screen.service";
import { RecordScreenController } from "./record-screen.controller";
import { MinioModule } from "@/shared/minio/minio.module";

@Module({
  imports: [MinioModule],
  providers: [RecordScreenService],
  controllers: [RecordScreenController],
})
export class RecordScreenModule {}
