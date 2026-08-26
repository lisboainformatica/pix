import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.account.findMany({
    take: 10,
    orderBy: { accountNumber: 'asc' },
  });
  console.log('--- Contas no Banco ---');
  accounts.forEach(acc => {
    console.log(`AccountNumber: ${acc.accountNumber}, UserId: ${acc.userId}, Balance: ${acc.balance.toString()}`);
  });

  const total = await prisma.account.aggregate({
    _sum: {
      balance: true,
    },
  });
  console.log(`💰 Total Balance in DB: R$ ${total._sum.balance?.toString()}`);

  const txCount = await prisma.transaction.count();
  console.log(`📊 Total Transactions in DB: ${txCount}`);
}

main().finally(() => prisma.$disconnect());
