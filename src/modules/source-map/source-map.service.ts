import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '@/shared/prisma/prisma.service';

@Injectable()
export class SourceMapService {
  constructor(private prisma: PrismaService) {}

  async uploadMapFile(apikey: string, fileName: string, content: string) {
    return this.prisma.sourceMapFile.upsert({
      where: { fileName_apikey: { fileName, apikey } },
      create: { fileName, apikey, content },
      update: { content },
    });
  }

  async readMapFile(fileName: string): Promise<string> {
    if (!fileName) {
      throw new BadRequestException('fileName 参数不能为空');
    }
    const safeName = path.basename(fileName);
    const record = await this.prisma.sourceMapFile.findFirst({
      where: { fileName: safeName },
    });
    if (!record) {
      throw new NotFoundException(`SourceMap 不存在: ${safeName}`);
    }
    return record.content;
  }
}
