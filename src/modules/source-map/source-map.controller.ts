import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Response } from 'express';
import * as path from 'path';
import { SourceMapService } from './source-map.service';

@ApiTags('SourceMap')
@Controller()
export class SourceMapController {
  constructor(private sourceMapService: SourceMapService) {}

  @ApiOperation({ summary: '上传 JS SourceMap 文件（CI/CD 调用）' })
  @ApiQuery({ name: 'apikey', description: '项目 apikey' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiBearerAuth()
  @Post('uploadmap')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMap(
    @UploadedFile() file: Express.Multer.File,
    @Query('apikey') apikey: string,
  ) {
    const fileName = path.basename(file.originalname, '.map');
    const content = file.buffer.toString('utf-8');
    return this.sourceMapService.uploadMapFile(apikey, fileName, content);
  }

  @ApiOperation({ summary: '获取 JS SourceMap 文件' })
  @ApiQuery({ name: 'fileName', description: 'JS 文件名 (不含 .map 后缀)' })
  @Get('getmap')
  async getMap(@Query('fileName') fileName: string, @Res() res: Response) {
    const content = await this.sourceMapService.readMapFile(fileName);
    res.setHeader('Content-Type', 'application/json');
    res.send(content);
  }
}
