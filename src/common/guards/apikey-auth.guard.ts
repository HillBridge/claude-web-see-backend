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
      const matched = this.originAllowed(origin, allowedOrigins);
      if (!matched) {
        throw new ForbiddenException(`域名 ${origin} 未在白名单中`);
      }
    }

    req.project = project;
    return true;
  }

  /**
   * 按 host 精确匹配,避免 startsWith 前缀绕过
   * (如白名单 https://example.com 不应放行 https://example.com.evil.com)。
   * 注:Origin/Referer 头对非浏览器客户端可伪造,此校验仅作浏览器侧的纵深防御。
   */
  private originAllowed(origin: string, allowed: string[]): boolean {
    const host = this.extractHost(origin);
    if (!host) return false;
    return allowed.some((entry) => {
      const allowedHost = this.extractHost(entry) || entry.trim().toLowerCase();
      return host === allowedHost;
    });
  }

  private extractHost(value: string): string | null {
    if (!value) return null;
    try {
      return new URL(value).host.toLowerCase();
    } catch {
      return null;
    }
  }
}
