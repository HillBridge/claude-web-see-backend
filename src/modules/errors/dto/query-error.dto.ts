import { IsOptional, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@common/dto/pagination.dto';

export class QueryErrorDto extends PaginationDto {
  @ApiPropertyOptional({ description: '项目 apikey' })
  @IsOptional()
  @IsString()
  apikey?: string;

  @ApiPropertyOptional({ description: '项目编号 (Project.id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @ApiPropertyOptional({ description: '错误类型: error | unhandledrejection | resourceError | httpError' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '用户 ID (monitorUserId)' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '报错起始时间戳 (ms)' })
  @IsOptional()
  @Type(() => Number)
  startTime?: number;

  @ApiPropertyOptional({ description: '报错结束时间戳 (ms)' })
  @IsOptional()
  @Type(() => Number)
  endTime?: number;
}
