import { z } from 'zod';
import * as dotenv from 'dotenv';

// Carrega o arquivo .env se estiver disponível
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL inválida' }),
  REDIS_URL: z.string().url({ message: 'REDIS_URL inválida' }),
  JWT_SECRET: z.string().min(8, { message: 'JWT_SECRET deve ter pelo menos 8 caracteres' }),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(8, { message: 'REFRESH_TOKEN_SECRET deve ter pelo menos 8 caracteres' }),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),
  THROTTLER_LIMIT: z.coerce.number().default(100),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Variáveis de ambiente inválidas ou ausentes:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
