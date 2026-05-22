import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IPageResult } from '@/common/interfaces/page-result.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: { username: string; email: string; password: string }) {
    return this.prisma.user.create({ data });
  }

  async findAll(query: QueryUserDto): Promise<IPageResult<any>> {
    const { page = 1, pageSize = 20, username } = query;
    const skip = (page - 1) * pageSize;
    const where = username
      ? { username: { contains: username } }
      : {};

    const [list, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        select: { id: true, username: true, email: true, role: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number, currentUser: { id: number; role: string }) {
    if (currentUser.role !== 'ADMIN' && currentUser.id !== id) {
      throw new ForbiddenException('无权访问他人信息');
    }
    return this.findById(id);
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    currentUser: { id: number; role: string },
  ) {
    if (currentUser.role !== 'ADMIN' && currentUser.id !== id) {
      throw new ForbiddenException('无权修改他人信息');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    if (dto.username && dto.username !== user.username) {
      if (await this.findByUsername(dto.username)) throw new ConflictException('用户名已被占用');
    }
    if (dto.email && dto.email !== user.email) {
      if (await this.findByEmail(dto.email)) throw new ConflictException('邮箱已被注册');
    }

    const updateData: any = {};
    if (dto.username) updateData.username = dto.username;
    if (dto.email) updateData.email = dto.email;
    // 普通用户不可自行提升权限
    if (dto.role && currentUser.role === 'ADMIN') updateData.role = dto.role;
    if (dto.newPassword) updateData.password = await bcrypt.hash(dto.newPassword, 10);

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, email: true, role: true, updatedAt: true },
    });
  }

  async remove(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    await this.prisma.user.delete({ where: { id } });
    return { message: '删除成功' };
  }
}
