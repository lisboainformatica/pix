import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Idempotency, IdempotencyStatus } from '@prisma/client';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tenta iniciar uma operação idempotente.
   * Retorna true se a operação foi iniciada com sucesso.
   * Retorna false se a chave já existe.
   */
  async start(key: string): Promise<boolean> {
    try {
      await this.prisma.idempotency.create({
        data: {
          key,
          status: IdempotencyStatus.RUNNING,
        },
      });
      return true;
    } catch (e: any) {
      // Código P2002 do Prisma significa violação de UNIQUE constraint
      if (e.code === 'P2002') {
        return false;
      }
      throw e;
    }
  }

  async get(key: string): Promise<Idempotency | null> {
    return this.prisma.idempotency.findUnique({
      where: { key },
    });
  }

  async complete(key: string, responseStatus: number, responseBody: any): Promise<void> {
    await this.prisma.idempotency.update({
      where: { key },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseStatus,
        responseBody: typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
      },
    });
  }

  async delete(key: string): Promise<void> {
    await this.prisma.idempotency.delete({
      where: { key },
    });
  }
}
