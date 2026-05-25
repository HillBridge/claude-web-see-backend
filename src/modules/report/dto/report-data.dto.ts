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
  subType?: string;

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
  filename?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lineno?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  colno?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stack?: string;

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

  // ── 性能字段 ──────────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsNumber() fp?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fcp?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() lcp?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fid?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() cls?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() ttfb?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() dns?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() tcp?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() ssl?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() loadTime?: number;
}
