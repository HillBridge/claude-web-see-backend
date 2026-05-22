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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const userId = (req as any).user?.id ?? '-';
    const startTime = Date.now();

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
          });
        },
      }),
    );
  }
}
