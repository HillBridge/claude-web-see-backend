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
}
