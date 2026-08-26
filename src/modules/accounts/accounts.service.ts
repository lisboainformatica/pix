import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Account, Prisma } from '@prisma/client';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string): Promise<Account> {
    // Tenta gerar um número de conta único de 6 dígitos
    let accountNumber = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      accountNumber = Math.floor(100000 + Math.random() * 900000).toString();
      const existingAccount = await this.prisma.account.findUnique({
        where: { accountNumber },
      });
      if (!existingAccount) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new ConflictException('Não foi possível gerar um número de conta único');
    }

    return this.prisma.account.create({
      data: {
        userId,
        accountNumber,
        balance: new Prisma.Decimal('0.00'), // Saldo inicial zerado
      },
    });
  }

  async findById(id: string): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: { id },
    });
  }

  async findByUserId(userId: string): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { userId },
    });
  }

  async findByAccountNumber(accountNumber: string): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: { accountNumber },
    });
  }

  async depositSimulated(accountId: string, amount: string): Promise<Account> {
    const account = await this.findById(accountId);
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }

    const parsedAmount = new Prisma.Decimal(amount);
    if (parsedAmount.lessThanOrEqualTo(0)) {
      throw new ConflictException('Valor do depósito deve ser maior que zero');
    }

    // Depósito simulado simples com incremento atômico
    return this.prisma.account.update({
      where: { id: accountId },
      data: {
        balance: {
          increment: parsedAmount,
        },
      },
    });
  }
}
