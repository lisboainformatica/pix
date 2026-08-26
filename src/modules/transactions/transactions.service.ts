import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { PixKeysService } from '../pix-keys/pix-keys.service';
import { IdempotencyService } from './idempotency.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly pixKeysService: PixKeysService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async transfer(userId: string, dto: CreateTransferDto, idempotencyKey?: string) {
    // 1. Controle de Idempotência
    if (idempotencyKey) {
      const existing = await this.idempotencyService.get(idempotencyKey);
      if (existing) {
        if (existing.status === 'RUNNING') {
          throw new ConflictException({
            statusCode: 409,
            error: 'TRANSACTION_IN_PROGRESS',
            message: 'Esta transação já está sendo processada. Tente novamente em breve.',
          });
        }
        // Retorna o resultado salvo em cache
        return JSON.parse(existing.responseBody!);
      }

      // Tenta reservar a chave de idempotência
      const started = await this.idempotencyService.start(idempotencyKey);
      if (!started) {
        throw new ConflictException({
          statusCode: 409,
          error: 'TRANSACTION_IN_PROGRESS',
          message: 'Transação concorrente detectada para esta chave de idempotência.',
        });
      }
    }

    let isKeyCreated = !!idempotencyKey;

    try {
      // 2. Validações preliminares (fora da transação de banco para evitar lock desnecessário)
      const senderAccount = await this.accountsService.findById(dto.senderAccountId);
      if (!senderAccount) {
        throw new NotFoundException('Conta de origem não encontrada');
      }

      // Prevenção de IDOR / BOLA:
      // O remetente precisa possuir a conta de origem da transferência.
      if (senderAccount.userId !== userId) {
        throw new ForbiddenException('Você não tem permissão para movimentar esta conta');
      }

      const pixKey = await this.pixKeysService.findByValue(dto.destinationKey);
      const recipientAccount = pixKey.account;

      // Validação de mesma conta
      if (senderAccount.id === recipientAccount.id) {
        throw new BadRequestException('A conta de origem não pode ser igual à conta de destino');
      }

      const amountDecimal = new Prisma.Decimal(dto.amount);
      if (amountDecimal.lessThanOrEqualTo(0)) {
        throw new BadRequestException('O valor da transferência deve ser maior que zero');
      }

      // 3. Ordenação de Lock para Prevenção de Deadlock
      // Garantimos que o lock seja sempre adquirido na mesma ordem lógica física das linhas.
      const [firstId, secondId] = [senderAccount.id, recipientAccount.id].sort();

      // 4. Início da transação de banco de dados
      const result = await this.prisma.$transaction(async (tx) => {
        // Bloqueio pessimista de linhas (Pessimistic Row-Level Locking)
        // Usamos template literals com $queryRaw para consultas parametrizadas seguras contra SQL injection.
        await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${firstId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${secondId} FOR UPDATE`;

        // Busca o saldo atualizado pós-lock
        const lockedSender = await tx.account.findUnique({
          where: { id: senderAccount.id },
        });
        const lockedRecipient = await tx.account.findUnique({
          where: { id: recipientAccount.id },
        });

        if (!lockedSender || !lockedRecipient) {
          throw new NotFoundException('Conta de origem ou destino não encontrada dentro da transação');
        }

        // Validação de saldo
        if (lockedSender.balance.lessThan(amountDecimal)) {
          throw new BadRequestException('Saldo insuficiente para realizar a transferência');
        }

        // Realiza o débito e o crédito
        const updatedSender = await tx.account.update({
          where: { id: senderAccount.id },
          data: {
            balance: {
              decrement: amountDecimal,
            },
          },
        });

        const updatedRecipient = await tx.account.update({
          where: { id: recipientAccount.id },
          data: {
            balance: {
              increment: amountDecimal,
            },
          },
        });

        // Cria o registro da transferência concluída
        const transaction = await tx.transaction.create({
          data: {
            senderAccountId: senderAccount.id,
            recipientAccountId: recipientAccount.id,
            amount: amountDecimal,
            description: dto.description,
            status: 'COMPLETED',
            idempotencyKey: idempotencyKey || null,
          },
        });

        // Grava auditoria
        await tx.auditLog.create({
          data: {
            userId,
            action: 'PIX_TRANSFER',
            details: JSON.stringify({
              transactionId: transaction.id,
              senderAccountId: senderAccount.id,
              recipientAccountId: recipientAccount.id,
              amount: dto.amount,
              idempotencyKey,
            }),
          },
        });

        return {
          id: transaction.id,
          status: transaction.status,
          amount: dto.amount,
          description: transaction.description,
          senderAccountNumber: updatedSender.accountNumber,
          recipientAccountNumber: updatedRecipient.accountNumber,
          createdAt: transaction.createdAt,
        };
      });

      // 5. Salva resultado no cache de idempotência
      if (idempotencyKey) {
        await this.idempotencyService.complete(idempotencyKey, 201, result);
      }

      return result;
    } catch (error) {
      // Em caso de falha de negócio ou sistema, deletamos a reserva de idempotência
      // para permitir que o usuário tente novamente após corrigir a entrada/saldo.
      if (idempotencyKey && isKeyCreated) {
        await this.idempotencyService.delete(idempotencyKey).catch(() => {});
      }
      throw error;
    }
  }

  async findById(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        senderAccount: true,
        recipientAccount: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transação não encontrada');
    }

    // Prevenção de IDOR / BOLA:
    // O usuário logado só pode ver detalhes de transações onde ele seja o remetente ou destinatário.
    if (transaction.senderAccount.userId !== userId && transaction.recipientAccount.userId !== userId) {
      throw new ForbiddenException('Acesso não autorizado a esta transação');
    }

    return transaction;
  }

  async findAll(userId: string, accountId?: string) {
    if (accountId) {
      const account = await this.accountsService.findById(accountId);
      if (!account) {
        throw new NotFoundException('Conta não encontrada');
      }
      if (account.userId !== userId) {
        throw new ForbiddenException('Acesso não autorizado a esta conta');
      }

      return this.prisma.transaction.findMany({
        where: {
          OR: [
            { senderAccountId: accountId },
            { recipientAccountId: accountId },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Retorna todas as transações das contas do usuário
    const userAccounts = await this.accountsService.findByUserId(userId);
    const accountIds = userAccounts.map(a => a.id);

    return this.prisma.transaction.findMany({
      where: {
        OR: [
          { senderAccountId: { in: accountIds } },
          { recipientAccountId: { in: accountIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reverse(userId: string, transactionId: string): Promise<any> {
    // Estorno de transações
    // Um estorno (reversal) transfere de volta os valores.
    // É uma transação de sentido oposto.
    const originalTx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        senderAccount: true,
        recipientAccount: true,
      },
    });

    if (!originalTx) {
      throw new NotFoundException('Transação original não encontrada');
    }

    if (originalTx.status !== 'COMPLETED') {
      throw new BadRequestException('Apenas transações concluídas podem ser estornadas');
    }

    // IDOR / BOLA: Apenas o destinatário original (quem recebeu o dinheiro)
    // ou o remetente original (em caso de estorno autorizado/solicitação especial) pode iniciar.
    // Vamos simular que o destinatário original (recipientAccount) devolve o dinheiro ao remetente original (senderAccount).
    // Ou seja, quem está logado precisa ser o dono da conta que recebeu os fundos originalmente (recipientAccount.userId).
    if (originalTx.recipientAccount.userId !== userId) {
      throw new ForbiddenException('Apenas o destinatário da transação original pode solicitar o estorno voluntário');
    }

    // Cria os parâmetros da nova transferência reversa
    const firstId = originalTx.recipientAccountId; // quem devolve
    const secondId = originalTx.senderAccountId;    // quem recebe de volta
    const amountDecimal = originalTx.amount;

    const [lockFirst, lockSecond] = [firstId, secondId].sort();

    return this.prisma.$transaction(async (tx) => {
      // Locks
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${lockFirst} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${lockSecond} FOR UPDATE`;

      const lockedSender = await tx.account.findUnique({ where: { id: firstId } });
      if (!lockedSender || lockedSender.balance.lessThan(amountDecimal)) {
        throw new BadRequestException('Saldo insuficiente na conta para realizar o estorno');
      }

      // Debita
      await tx.account.update({
        where: { id: firstId },
        data: { balance: { decrement: amountDecimal } },
      });

      // Credita
      await tx.account.update({
        where: { id: secondId },
        data: { balance: { increment: amountDecimal } },
      });

      // Atualiza status da original para estornada?
      // O prompt diz: "Uma transação concluída não deve simplesmente ser apagada do banco.
      // Estados da transação devem possuir uma máquina de estados: PENDING -> PROCESSING -> COMPLETED ou FAILED.
      // Estorno gera uma nova transação que registra a reversão para auditar tudo de forma limpa."
      // Vamos criar um registro de estorno e atualizar o status da original se necessário (ou marcar em uma tabela).
      // Mas para manter a auditoria limpa, criamos uma nova transação com descrição "Estorno de ..." e vinculada.
      const reversalTx = await tx.transaction.create({
        data: {
          senderAccountId: firstId,
          recipientAccountId: secondId,
          amount: amountDecimal,
          description: `Estorno da transação ${originalTx.id}`,
          status: 'COMPLETED',
        },
      });

      // Grava auditoria
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PIX_REVERSAL',
          details: JSON.stringify({
            originalTransactionId: originalTx.id,
            reversalTransactionId: reversalTx.id,
            amount: originalTx.amount,
          }),
        },
      });

      return {
        id: reversalTx.id,
        status: reversalTx.status,
        amount: originalTx.amount.toString(),
        description: reversalTx.description,
        createdAt: reversalTx.createdAt,
      };
    });
  }
}
