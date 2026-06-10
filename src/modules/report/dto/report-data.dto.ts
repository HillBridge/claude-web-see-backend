import {
  IsOptional, IsString, IsNumber, IsArray, IsNotEmpty,
  IsIn, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const REPORT_TYPES = [
  'performance', 'recordScreen', 'whiteScreen',
  'error', 'unhandledrejection', 'resourceError', 'httpError',
];

export class BreadcrumbDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() data?: any;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsNumber() time?: number;
  @IsOptional() @IsString() message?: string;
}

export class ReportDataDto {
  @ApiProperty({ enum: REPORT_TYPES })
  @IsNotEmpty()
  @IsString()
  @IsIn(REPORT_TYPES)
  type: string;

  @ApiProperty({ description: '项目 apikey' })
  @IsNotEmpty()
  @IsString()
  apikey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  time?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sdkVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  deviceInfo?: any;

  // ── 错误字段 ──────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lineNo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  colNo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recordScreenId?: string;

  @ApiPropertyOptional({ type: [BreadcrumbDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BreadcrumbDto)
  breadcrumb?: BreadcrumbDto[];

  // ── 录屏字段 ──────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  events?: string;

  // ── 性能字段(SDK 长格式:一指标一条)──────────────────────
  @ApiPropertyOptional({ description: '指标/事件名: FCP/LCP/FID/CLS/TTFB/FSP/longTask/resourceList/memory' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '标量指标值(ms 或 CLS 无量纲)' })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional({ description: '评级 good/needs-improvement/poor' })
  @IsOptional()
  @IsString()
  rating?: string;

  // 非标量性能事件明细(结构不固定,直存)
  @ApiPropertyOptional() @IsOptional() longTask?: any;
  @ApiPropertyOptional() @IsOptional() resourceList?: any;
  @ApiPropertyOptional() @IsOptional() memory?: any;
}
