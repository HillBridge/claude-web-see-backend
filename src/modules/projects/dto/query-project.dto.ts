import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '@common/dto/pagination.dto';

export class QueryProjectDto extends PaginationDto {
  @ApiPropertyOptional({ description: '按项目名模糊搜索' })
  @IsOptional()
  @IsString()
  name?: string;
}
