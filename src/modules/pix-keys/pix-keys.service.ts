import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CreatePixKeyDto } from './dto/create-pix-key.dto';
import { PixKey } from '@prisma/client';

@Injectable()
export class PixKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  async create(userId: string, dto: CreatePixKeyDto): Promise<PixKey> {
    const account = await this.accountsService.findById(dto.accountId);
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }

    // Prevenção de IDOR / BOLA:
    // O usuário logado só pode vincular uma chave Pix à sua própria conta.
    if (account.userId !== userId) {
      throw new ForbiddenException('Acesso não autorizado a esta conta');
    }

    // Valida unicidade da chave Pix
    const existingKey = await this.prisma.pixKey.findUnique({
      where: { value: dto.value },
    });
    if (existingKey) {
      throw new ConflictException('Chave Pix já cadastrada');
    }

    return this.prisma.pixKey.create({
      data: {
        accountId: dto.accountId,
        type: dto.type,
        value: dto.value,
      },
    });
  }

  async findByValue(value: string) {
    const pixKey = await this.prisma.pixKey.findUnique({
      where: { value },
      include: {
        account: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!pixKey) {
      throw new NotFoundException('Chave Pix não encontrada');
    }

    return pixKey;
  }

  async remove(userId: string, id: string): Promise<void> {
    const pixKey = await this.prisma.pixKey.findUnique({
      where: { id },
      include: {
        account: true,
      },
    });

    if (!pixKey) {
      throw new NotFoundException('Chave Pix não encontrada');
    }

    // Prevenção de IDOR / BOLA:
    // O usuário logado só pode remover uma chave Pix que pertence a uma de suas contas.
    if (pixKey.account.userId !== userId) {
      throw new ForbiddenException('Acesso não autorizado a esta chave Pix');
    }

    await this.prisma.pixKey.delete({
      where: { id },
    });
  }
}
