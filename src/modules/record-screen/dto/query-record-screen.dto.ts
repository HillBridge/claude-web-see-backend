import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@common/dto/pagination.dto';

export class QueryRecordScreenDto extends PaginationDto {
  @ApiPropertyOptional({ description: '项目 apikey' })
  @IsOptional()
  @IsString()
  apikey?: string;
}
