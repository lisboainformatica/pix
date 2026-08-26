import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'] || randomUUID();
    
    // Anexa ao request para uso em logs e interceptors
    req['requestId'] = requestId;
    
    // Anexa ao response header para retorno ao cliente
    res.setHeader('x-request-id', requestId as string);
    
    next();
  }
}
