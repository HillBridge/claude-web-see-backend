import { IsString, IsOptional, MaxLength, MinLength, IsArray, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: '电商平台', description: '项目名称' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({ example: '主站前端监控项目' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    example: ['https://example.com', 'https://www.example.com'],
    description: '允许上报的域名列表，空数组表示不限制',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  allowedOrigins?: string[];
}
