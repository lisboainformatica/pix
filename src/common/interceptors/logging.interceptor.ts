import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const requestId = request['requestId'] || 'N/A';
    const method = request.method;
    const route = request.url;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          const statusCode = response.statusCode;

          const logData = {
            requestId,
            method,
            route,
            statusCode,
            durationMs,
          };

          // Logs estruturados em formato JSON
          this.logger.log(JSON.stringify(logData));
        },
        error: (err) => {
          // Erros são tratados e logados no HttpExceptionFilter
        }
      })
    );
  }
}
