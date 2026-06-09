import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Res,
  Headers,
  BadRequestException,
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
import * as crypto from 'crypto';
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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 }, // 单文件 ≤20MB
      fileFilter: (_req, file, cb) => {
        // 仅允许 .map / JSON 类文件
        const ok =
          file.originalname.endsWith('.map') ||
          file.mimetype === 'application/json' ||
          file.mimetype === 'application/octet-stream';
        cb(ok ? null : new BadRequestException('仅允许上传 .map 文件'), ok);
      },
    }),
  )
  async uploadMap(
    @UploadedFile() file: Express.Multer.File,
    @Query('apikey') apikey: string,
    @Headers('x-upload-secret') secret: string,
  ) {
    const expected = this.configService.get<string>('sourcemapUploadSecret');
    if (!expected || !this.secretEquals(secret, expected)) {
      throw new UnauthorizedException('X-Upload-Secret 无效');
    }
    if (!file) {
      throw new BadRequestException('未接收到上传文件');
    }
    // 校验 apikey 对应项目存在,避免写入任意 apikey 目录
    const project = await this.prisma.project.findUnique({ where: { apikey } });
    if (!project) {
      throw new BadRequestException('无效的 apikey');
    }
    const fileName = path.basename(file.originalname, '.map');
    const content = file.buffer.toString('utf-8');
    return this.sourceMapService.uploadMapFile(apikey, fileName, content);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '获取 JS SourceMap 文件（需登录；apikey 须归属当前用户）' })
  @ApiQuery({ name: 'fileName', description: 'JS 文件名 (不含 .map 后缀)' })
  @ApiQuery({ name: 'apikey', description: '项目 apikey' })
  @Get('getmap')
  async getMap(
    @Query('fileName') fileName: string,
    @Query('apikey') apikey: string,
    @CurrentUser() user: TenantUser,
    @Res() res: Response,
  ) {
    // 源码还原发生在已登录的管理后台,故 getmap 改为需 JWT(去掉 @Public);
    // 并校验 apikey 归属当前用户,防止越权读取他人项目的 sourcemap(等同泄露源码)。
    await assertApikeyAccess(this.prisma, user, apikey);
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

  /** 恒定时间比较上传密钥,避免 !== 短路比较带来的时序侧信道 */
  private secretEquals(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    // 长度不一致直接判否(timingSafeEqual 要求等长 Buffer)
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  }
}
