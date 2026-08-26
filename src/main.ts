import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { env } from './config/env.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Helmet para proteção contra vulnerabilidades web conhecidas através de cabeçalhos HTTP
  app.use(helmet());

  // CORS habilitado com origens configuráveis via .env
  app.enableCors({
    origin: env.CORS_ORIGIN,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Pipe de validação global para sanitização e validação dos DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuração do Swagger OpenAPI
  const config = new DocumentBuilder()
    .setTitle('Simulador Pix Educacional')
    .setDescription('Documentação detalhada das APIs de simulação do sistema Pix.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.PORT);
  console.log(`🚀 Servidor rodando na porta ${env.PORT}`);
  console.log(`📖 Documentação Swagger disponível em http://localhost:${env.PORT}/api/docs`);
}
bootstrap();
