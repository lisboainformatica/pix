import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Verificação de Liveness (Indica se a aplicação está de pé)' })
  @ApiResponse({ status: 200, description: 'Aplicação está ativa.' })
  async getLive() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Verificação de Readiness (Valida conexão com as dependências Postgres e Redis)' })
  @ApiResponse({ status: 200, description: 'Todas as dependências estão prontas.' })
  @ApiResponse({ status: 503, description: 'Uma ou mais dependências estão fora do ar.' })
  async getReady() {
    const details: any = {
      database: 'DOWN',
      redis: 'DOWN',
    };
    let isHealthy = true;

    // 1. Testa banco de dados
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      details.database = 'UP';
    } catch (e) {
      isHealthy = false;
    }

    // 2. Testa Redis
    try {
      const pong = await this.redis.ping();
      if (pong === 'PONG') {
        details.redis = 'UP';
      } else {
        isHealthy = false;
      }
    } catch (e) {
      isHealthy = false;
    }

    if (!isHealthy) {
      throw new ServiceUnavailableException({
        status: 'DOWN',
        timestamp: new Date().toISOString(),
        details,
      });
    }

    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      details,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Verificação de integridade combinada' })
  async getHealth() {
    return this.getReady();
  }
}
