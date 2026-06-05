import { Module } from "@nestjs/common";
import { CleanupService } from "./cleanup.service";
import { SharedModule } from "@/shared/shared.module";
import { MinioModule } from "@/shared/minio/minio.module";

@Module({
  imports: [SharedModule, MinioModule],
  providers: [CleanupService],
})
export class CleanupModule {}
