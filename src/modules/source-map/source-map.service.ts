import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '@/shared/prisma/prisma.service';

@Injectable()
export class SourceMapService {
  private readonly distPath: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const distPathConfig = this.configService.get<string>('distPath') || '../dist';
    this.distPath = path.resolve(process.cwd(), distPathConfig);
  }

  // 供 CI/CD 生产环境使用：上传 map 文件到 DB
  async uploadMapFile(apikey: string, fileName: string, content: string) {
    return this.prisma.sourceMapFile.upsert({
      where: { fileName_apikey: { fileName, apikey } },
      create: { fileName, apikey, content },
      update: { content },
    });
  }

  async readMapFile(fileName: string): Promise<string | Buffer> {
    if (!fileName) {
      throw new BadRequestException('fileName 参数不能为空');
    }
    const safeName = path.basename(fileName);

    // 开发环境：直接读本地 dist/js/*.map，每次 build 自动生效，无需手动同步
    const mapPath = path.join(this.distPath, 'js', `${safeName}.map`);
    if (fs.existsSync(mapPath)) {
      return fs.readFileSync(mapPath);
    }

    // 生产环境 fallback：查 DB（CI/CD 上传的 source map）
    const record = await this.prisma.sourceMapFile.findFirst({
      where: { fileName: safeName },
    });
    if (record) {
      return record.content;
    }

    throw new NotFoundException(`SourceMap 不存在: ${safeName}，请确认前端已构建或已上传 map 文件`);
  }
}
