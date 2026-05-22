import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

const SENSITIVE_KEYS = new Set(['password', 'confirmPassword', 'token', 'secret']);

function sanitize(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = SENSITIVE_KEYS.has(k) ? '***' : v;
  }
  return result;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url, params, query } = req;
    const userId = (req as any).user?.id ?? '-';
    const startTime = Date.now();

    const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
    const body = isMultipart ? '[multipart/form-data]' : sanitize(req.body ?? {});

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = context.switchToHttp().getResponse().statusCode;
          const duration = Date.now() - startTime;
          this.logger.info(`${method} ${url} ${statusCode} +${duration}ms`, {
            userId,
            method,
            url,
            statusCode,
            duration,
            params,
            query,
            body,
          });
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          this.logger.warn(`${method} ${url} ERROR +${duration}ms`, {
            userId,
            method,
            url,
            error: err?.message,
            duration,
            params,
            query,
            body,
          });
        },
      }),
    );
  }
}
