import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { MinioService } from '@/shared/minio/minio.service';
import { PrismaService } from '@/shared/prisma/prisma.service';

@Injectable()
export class SourceMapService {
  private readonly distPath: string;

  constructor(
    private minioService: MinioService,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const distPathConfig = this.configService.get<string>('distPath') || '../dist';
    this.distPath = path.resolve(process.cwd(), distPathConfig);
  }

  // 对象存储 key: {apikey}/{fileName}.map
  private objectKey(apikey: string, fileName: string): string {
    return `${apikey}/${fileName}.map`;
  }

  async uploadMapFile(apikey: string, fileName: string, content: string) {
    const key = this.objectKey(apikey, fileName);
    await this.minioService.putObject(key, Buffer.from(content, 'utf-8'));

    await this.prisma.sourceMapFile.upsert({
      where: { fileName_apikey: { fileName, apikey } },
      create: { fileName, apikey, minioKey: key },
      update: { minioKey: key },
    });

    return { fileName, apikey, key };
  }

  async readMapFile(fileName: string, apikey?: string): Promise<string | Buffer> {
    if (!fileName) {
      throw new BadRequestException('fileName 参数不能为空');
    }
    const safeName = path.basename(fileName);

    // 开发环境：优先读本地 dist/js/*.map，无需上传直接生效
    const mapPath = path.join(this.distPath, 'js', `${safeName}.map`);
    if (fs.existsSync(mapPath)) {
      return fs.readFileSync(mapPath);
    }

    // 生产环境：从 MinIO 读取
    // 如果传了 apikey，精确查找；否则尝试按 fileName 前缀查找第一个匹配
    if (apikey) {
      const key = this.objectKey(apikey, safeName);
      if (await this.minioService.objectExists(key)) {
        return this.minioService.getObject(key);
      }
    }

    throw new NotFoundException(
      `SourceMap 不存在: ${safeName}，请确认前端已构建或已上传 map 文件`,
    );
  }

  async listByApikey(apikey: string) {
    return this.prisma.sourceMapFile.findMany({
      where: { apikey },
      select: { id: true, fileName: true, minioKey: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async deleteMapFile(apikey: string, fileName: string) {
    const record = await this.prisma.sourceMapFile.findUnique({
      where: { fileName_apikey: { fileName, apikey } },
    });
    if (!record) {
      throw new NotFoundException(`SourceMap 不存在: ${fileName}`);
    }
    await this.minioService.removeObject(record.minioKey);
    await this.prisma.sourceMapFile.delete({
      where: { fileName_apikey: { fileName, apikey } },
    });
  }
}
