import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { SourceMapService } from './source-map.service';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('SourceMap')
@Controller()
export class SourceMapController {
  constructor(private sourceMapService: SourceMapService) {}

  /**
   * 兼容旧接口 /getmap?fileName=xxx
   * 前端 sourcemap.js 调用此接口还原错误源码位置
   */
  @ApiOperation({ summary: '获取 JS SourceMap 文件' })
  @ApiQuery({ name: 'fileName', description: 'JS 文件名 (不含 .map 后缀)' })
  @Public()
  @Get('getmap')
  getMap(@Query('fileName') fileName: string, @Res() res: Response) {
    const data = this.sourceMapService.readMapFile(fileName);
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  }
}
