import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('项目管理')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @ApiOperation({ summary: '创建项目，自动生成 apikey' })
  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: any) {
    return this.projectsService.create(dto, user.id);
  }

  @ApiOperation({ summary: '查询项目列表' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
  ) {
    return this.projectsService.findAll(
      user.id,
      user.role === 'ADMIN',
      Number(page),
      Number(pageSize),
    );
  }

  @ApiOperation({ summary: '查询项目详情' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.projectsService.findOne(id, user.id, user.role === 'ADMIN');
  }

  @ApiOperation({ summary: '更新项目信息' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.update(id, dto, user.id, user.role === 'ADMIN');
  }

  @ApiOperation({ summary: '删除项目' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.projectsService.remove(id, user.id, user.role === 'ADMIN');
  }

  @ApiOperation({ summary: '重新生成 apikey' })
  @Post(':id/regenerate-apikey')
  regenerateApikey(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.regenerateApikey(
      id,
      user.id,
      user.role === 'ADMIN',
    );
  }
}
