import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@common/dto/pagination.dto';

export class QueryPerformanceDto extends PaginationDto {
  @ApiPropertyOptional({ description: '项目 apikey' })
  @IsOptional()
  @IsString()
  apikey?: string;

  @ApiPropertyOptional({ description: '起始时间戳 (ms)' })
  @IsOptional()
  @Type(() => Number)
  startTime?: number;

  @ApiPropertyOptional({ description: '结束时间戳 (ms)' })
  @IsOptional()
  @Type(() => Number)
  endTime?: number;

  @ApiPropertyOptional({ description: '归一化页面(trend/summary 过滤用)' })
  @IsOptional()
  @IsString()
  pageUrl?: string;

  @ApiPropertyOptional({ description: '指标名(trend 用): FCP/LCP/FID/CLS/TTFB/FSP' })
  @IsOptional()
  @IsString()
  name?: string;
}
