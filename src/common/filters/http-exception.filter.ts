import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as any;
        message = res.message || exception.message;
        // class-validator 校验失败时会包含 errors 数组
        if (Array.isArray(res.message)) {
          errors = res.message;
          message = '参数校验失败';
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error('HTTP Exception', {
      method: request.method,
      url: request.url,
      status,
      message,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(HttpStatus.OK).json({
      code: status,
      message,
      data: errors,
      timestamp: new Date().toISOString(),
    });
  }
}
