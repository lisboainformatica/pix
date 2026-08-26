import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { env } from '../../config/env.config';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    const requestId = request['requestId'] || 'N/A';
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let errorResponse: any = {
      statusCode: status,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Ocorreu um erro interno no servidor',
      requestId,
    };

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object') {
        errorResponse = {
          ...errorResponse,
          ...res,
          requestId, // Garante que o requestId continue no topo do output
        };
      } else {
        errorResponse.message = res;
      }
      
      // Mapeia nomes de erro HTTP comuns para consistência
      errorResponse.error = exception.name.replace('Exception', '_ERROR').toUpperCase();
    } else {
      // Erro desconhecido/não-HTTP
      if (env.NODE_ENV !== 'production') {
        // Em desenvolvimento, expõe o erro original
        errorResponse.message = exception.message || String(exception);
        errorResponse.stack = exception.stack;
      }
    }

    // Log estruturado do erro (sem expor stack trace em produção nos logs normais de info/warn)
    const logData = {
      requestId,
      method: request.method,
      route: request.url,
      statusCode: status,
      errorMessage: exception.message || String(exception),
      // Apenas inclui stack trace no log se for erro 500
      stack: status === HttpStatus.INTERNAL_SERVER_ERROR ? exception.stack : undefined,
    };
    
    this.logger.error(JSON.stringify(logData));

    response.status(status).json(errorResponse);
  }
}
