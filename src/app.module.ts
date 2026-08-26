import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './database/redis.module';
import { RedisService } from './database/redis.service';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { PixKeysModule } from './modules/pix-keys/pix-keys.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { HealthModule } from './modules/health/health.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { env } from './config/env.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    UsersModule,
    AuthModule,
    AccountsModule,
    PixKeysModule,
    TransactionsModule,
    HealthModule,
    // Rate Limiter distribuído configurado assincronamente com o RedisService injetado
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60000, // 60 segundos
            limit: env.THROTTLER_LIMIT, // limite configurável via env
          },
        ],
        storage: new ThrottlerStorageRedisService(redisService.getClient()),
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Habilita rate limiting global em todas as rotas da aplicação
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Interceptor global para logs estruturados HTTP
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // Filtro global para tratamento estruturado de exceções e erros HTTP
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Aplica o RequestIdMiddleware a todos os endpoints HTTP
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
