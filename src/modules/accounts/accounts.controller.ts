import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { DepositDto } from './dto/deposit.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova conta para o usuário logado' })
  @ApiResponse({ status: 201, description: 'Conta criada com sucesso.' })
  async create(@GetUser('id') userId: string) {
    return this.accountsService.create(userId);
  }

  @Get()
  @ApiOperation({ summary: 'Listar contas do usuário logado' })
  @ApiResponse({ status: 200, description: 'Lista de contas retornada com sucesso.' })
  async findAll(@GetUser('id') userId: string) {
    return this.accountsService.findByUserId(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de uma conta específica (Protegido contra IDOR/BOLA)' })
  @ApiResponse({ status: 200, description: 'Conta retornada com sucesso.' })
  @ApiResponse({ status: 403, description: 'Acesso negado (IDOR/BOLA detectado).' })
  @ApiResponse({ status: 404, description: 'Conta não encontrada.' })
  async findOne(@Param('id') id: string, @GetUser('id') currentUserId: string) {
    const account = await this.accountsService.findById(id);
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }

    // Prevenção de IDOR / BOLA:
    // O usuário logado só pode visualizar detalhes da sua própria conta.
    if (account.userId !== currentUserId) {
      throw new ForbiddenException('Acesso não autorizado a esta conta');
    }

    return account;
  }

  @Post(':id/deposit')
  @ApiOperation({ summary: 'Depositar saldo fictício para testes (Protegido contra IDOR/BOLA)' })
  @ApiResponse({ status: 200, description: 'Depósito efetuado com sucesso.' })
  @ApiResponse({ status: 403, description: 'Acesso negado (IDOR/BOLA detectado).' })
  @ApiResponse({ status: 404, description: 'Conta não encontrada.' })
  async deposit(
    @Param('id') id: string,
    @Body() depositDto: DepositDto,
    @GetUser('id') currentUserId: string,
  ) {
    const account = await this.accountsService.findById(id);
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }

    // IDOR / BOLA Prevention:
    // O usuário só pode depositar dinheiro simulado em sua própria conta.
    if (account.userId !== currentUserId) {
      throw new ForbiddenException('Acesso não autorizado a esta conta');
    }

    return this.accountsService.depositSimulated(id, depositDto.amount);
  }
}
