import { IsOptional, IsString, IsNumber, IsArray, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class BreadcrumbDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() data?: any;
  @IsOptional() @IsString() status?: string;
  @IsOptional() time?: number;
  @IsOptional() @IsString() message?: string;
}

export class ReportDataDto {
  /** performance | recordScreen | whiteScreen | error | unhandledrejection | resourceError | httpError */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

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
  time?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apikey?: string;

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

  // ── 错误字段 ───────────────────────────────────────────────
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
  lineno?: number;

  @ApiPropertyOptional()
  @IsOptional()
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
  breadcrumb?: BreadcrumbDto[];

  // ── 录屏字段 ───────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  events?: string;

  // ── 性能字段 ───────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  fp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  fcp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  lcp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  fid?: number;

  @ApiPropertyOptional()
  @IsOptional()
  cls?: number;

  @ApiPropertyOptional()
  @IsOptional()
  ttfb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  dns?: number;

  @ApiPropertyOptional()
  @IsOptional()
  tcp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  ssl?: number;

  @ApiPropertyOptional()
  @IsOptional()
  loadTime?: number;
}
