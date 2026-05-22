import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProjectDto, ownerId: number) {
    const apikey = uuidv4().replace(/-/g, '');
    return this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        apikey,
        ownerId,
      },
    });
  }

  async findAll(ownerId: number, isAdmin: boolean, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const where = isAdmin ? {} : { ownerId };
    const [list, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          owner: {
            select: { id: true, username: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.project.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number, userId: number, isAdmin: boolean) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, username: true } },
      },
    });
    if (!project) throw new NotFoundException('项目不存在');
    if (!isAdmin && project.ownerId !== userId) {
      throw new ForbiddenException('无权访问此项目');
    }
    return project;
  }

  async update(
    id: number,
    dto: UpdateProjectDto,
    userId: number,
    isAdmin: boolean,
  ) {
    await this.findOne(id, userId, isAdmin);
    return this.prisma.project.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number, userId: number, isAdmin: boolean) {
    await this.findOne(id, userId, isAdmin);
    await this.prisma.project.delete({ where: { id } });
    return { message: '项目已删除' };
  }

  /** 重新生成 apikey */
  async regenerateApikey(id: number, userId: number, isAdmin: boolean) {
    await this.findOne(id, userId, isAdmin);
    const apikey = uuidv4().replace(/-/g, '');
    return this.prisma.project.update({
      where: { id },
      data: { apikey },
      select: { id: true, name: true, apikey: true },
    });
  }
}
