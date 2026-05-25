import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectsService } from '../../modules/projects/projects.service';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private projectsService: ProjectsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const apikey: string = req.body?.apikey;

    if (!apikey) throw new UnauthorizedException('缺少 apikey');

    const project = await this.projectsService.findByApikey(apikey);
    if (!project) throw new UnauthorizedException('无效的 apikey');

    const allowedOrigins: string[] = project.allowedOrigins ?? [];
    if (allowedOrigins.length > 0) {
      const origin: string =
        req.headers['origin'] || req.headers['referer'] || '';
      const matched = allowedOrigins.some((allowed) =>
        origin.startsWith(allowed),
      );
      if (!matched) {
        throw new ForbiddenException(`域名 ${origin} 未在白名单中`);
      }
    }

    req.project = project;
    return true;
  }
}
