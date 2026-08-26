import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seeding do banco de dados de desenvolvimento...');

  // Limpa registros anteriores para evitar duplicações
  await prisma.idempotency.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.pixKey.deleteMany();
  await prisma.account.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // Senhas hashadas com Argon2id
  const passwordHash = await argon2.hash('password123');

  // 1. Criar Alice
  const alice = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      passwordHash,
    },
  });

  const accountAlice = await prisma.account.create({
    data: {
      userId: alice.id,
      accountNumber: '123456',
      balance: 1000.00, // Inicia com saldo fictício de R$ 1000.00
    },
  });

  await prisma.pixKey.create({
    data: {
      accountId: accountAlice.id,
      type: 'EMAIL',
      value: 'alice@example.com',
    },
  });

  console.log('✅ Usuário Alice criado com sucesso (E-mail: alice@example.com, Chave Pix: alice@example.com, Saldo: R$ 1000.00)');

  // 2. Criar Bob
  const bob = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      passwordHash,
    },
  });

  const accountBob = await prisma.account.create({
    data: {
      userId: bob.id,
      accountNumber: '654321',
      balance: 500.00, // Inicia com saldo fictício de R$ 500.00
    },
  });

  await prisma.pixKey.create({
    data: {
      accountId: accountBob.id,
      type: 'EMAIL',
      value: 'bob@example.com',
    },
  });

  console.log('✅ Usuário Bob criado com sucesso (E-mail: bob@example.com, Chave Pix: bob@example.com, Saldo: R$ 500.00)');
  console.log('🌱 Seeding finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
