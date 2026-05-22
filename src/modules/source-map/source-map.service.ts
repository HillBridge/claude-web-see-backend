import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class SourceMapService {
  private readonly distPath: string;

  constructor(private configService: ConfigService) {
    const distPathConfig = this.configService.get<string>('distPath') || '../dist';
    // 相对于当前运行目录解析
    this.distPath = path.resolve(process.cwd(), distPathConfig);
  }

  readMapFile(fileName: string): Buffer {
    if (!fileName) {
      throw new BadRequestException('fileName 参数不能为空');
    }
    // 安全校验: 不允许路径穿越
    const safeName = path.basename(fileName);
    const mapPath = path.join(this.distPath, 'js', `${safeName}.map`);

    if (!fs.existsSync(mapPath)) {
      throw new NotFoundException(`SourceMap 文件不存在: ${safeName}.map`);
    }

    return fs.readFileSync(mapPath);
  }
}
