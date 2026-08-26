import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pix/transfers')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Realizar uma transferência Pix (Protegido por Idempotency-Key)' })
  @ApiHeader({
    name: 'idempotency-key',
    description: 'Chave única UUID para garantir idempotência da operação financeira',
    required: false,
  })
  @ApiResponse({ status: 201, description: 'Transferência efetuada com sucesso.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou saldo insuficiente.' })
  @ApiResponse({ status: 409, description: 'Transação em duplicidade ou concorrente.' })
  async transfer(
    @Body() dto: CreateTransferDto,
    @GetUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.transactionsService.transfer(userId, dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'Obter histórico de transferências do usuário logado' })
  @ApiResponse({ status: 200, description: 'Histórico retornado com sucesso.' })
  async findAll(@GetUser('id') userId: string, @Query('accountId') accountId?: string) {
    return this.transactionsService.findAll(userId, accountId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de uma transação específica (Protegido contra IDOR/BOLA)' })
  @ApiResponse({ status: 200, description: 'Transação encontrada.' })
  @ApiResponse({ status: 403, description: 'Acesso negado.' })
  @ApiResponse({ status: 404, description: 'Transação não encontrada.' })
  async findOne(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.transactionsService.findById(userId, id);
  }

  @Post(':id/reversal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar estorno voluntário de uma transação Pix' })
  @ApiResponse({ status: 200, description: 'Estorno efetuado com sucesso.' })
  @ApiResponse({ status: 400, description: 'Transação não elegível para estorno ou saldo insuficiente.' })
  @ApiResponse({ status: 403, description: 'Acesso negado.' })
  @ApiResponse({ status: 404, description: 'Transação original não encontrada.' })
  async reverse(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.transactionsService.reverse(userId, id);
  }
}
