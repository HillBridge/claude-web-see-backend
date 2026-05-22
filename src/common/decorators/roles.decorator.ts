import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** 声明路由所需角色，配合全局 RolesGuard 使用 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
