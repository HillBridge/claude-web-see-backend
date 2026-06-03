import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Res,
  Headers,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiHeader,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as path from 'path';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { assertApikeyAccess, TenantUser } from '@/common/utils/tenant-scope';
import { PrismaService } from '@shared/prisma/prisma.service';
import { SourceMapService } from './source-map.service';

@ApiTags('SourceMap')
@Controller()
export class SourceMapController {
  constructor(
    private sourceMapService: SourceMapService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @ApiOperation({ summary: '上传 JS SourceMap 文件（CI/CD 调用，需 X-Upload-Secret 请求头）' })
  @ApiQuery({ name: 'apikey', description: '项目 apikey' })
  @ApiHeader({ name: 'X-Upload-Secret', description: '上传专用密钥（见后端 SOURCEMAP_UPLOAD_SECRET 环境变量）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @Post('uploadmap')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMap(
    @UploadedFile() file: Express.Multer.File,
    @Query('apikey') apikey: string,
    @Headers('x-upload-secret') secret: string,
  ) {
    const expected = this.configService.get<string>('sourcemapUploadSecret');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('X-Upload-Secret 无效');
    }
    const fileName = path.basename(file.originalname, '.map');
    const content = file.buffer.toString('utf-8');
    return this.sourceMapService.uploadMapFile(apikey, fileName, content);
  }

  @Public()
  @ApiOperation({ summary: '获取 JS SourceMap 文件' })
  @ApiQuery({ name: 'fileName', description: 'JS 文件名 (不含 .map 后缀)' })
  @ApiQuery({ name: 'apikey', description: '项目 apikey', required: false })
  @Get('getmap')
  async getMap(
    @Query('fileName') fileName: string,
    @Query('apikey') apikey: string,
    @Res() res: Response,
  ) {
    const content = await this.sourceMapService.readMapFile(fileName, apikey);
    res.setHeader('Content-Type', 'application/json');
    res.send(content);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '查询某项目已上传的 SourceMap 列表' })
  @ApiQuery({ name: 'apikey', description: '项目 apikey' })
  @Get('sourcemaps')
  async listSourceMaps(@Query('apikey') apikey: string, @CurrentUser() user: TenantUser) {
    await assertApikeyAccess(this.prisma, user, apikey);
    return this.sourceMapService.listByApikey(apikey);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '删除某个 SourceMap 文件' })
  @ApiQuery({ name: 'apikey', description: '项目 apikey' })
  @ApiQuery({ name: 'fileName', description: 'JS 文件名 (不含 .map 后缀)' })
  @Delete('sourcemap')
  async deleteSourceMap(
    @Query('apikey') apikey: string,
    @Query('fileName') fileName: string,
    @CurrentUser() user: TenantUser,
  ) {
    await assertApikeyAccess(this.prisma, user, apikey);
    await this.sourceMapService.deleteMapFile(apikey, fileName);
    return { message: '删除成功' };
  }
}
