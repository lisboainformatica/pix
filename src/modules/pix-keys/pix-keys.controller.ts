import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PixKeysService } from './pix-keys.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CreatePixKeyDto } from './dto/create-pix-key.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('pix-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pix/keys')
export class PixKeysController {
  constructor(private readonly pixKeysService: PixKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastrar nova chave Pix' })
  @ApiResponse({ status: 201, description: 'Chave Pix cadastrada com sucesso.' })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 403, description: 'Não autorizado a cadastrar chave para esta conta.' })
  @ApiResponse({ status: 409, description: 'Chave Pix já existente.' })
  async create(@Body() dto: CreatePixKeyDto, @GetUser('id') userId: string) {
    return this.pixKeysService.create(userId, dto);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Consultar chave Pix (Resolução de chave para transferências)' })
  @ApiResponse({ status: 200, description: 'Chave Pix encontrada.' })
  @ApiResponse({ status: 404, description: 'Chave Pix não encontrada.' })
  async findOne(@Param('key') key: string) {
    const pixKey = await this.pixKeysService.findByValue(key);
    // Retorna detalhes sanitizados para visualização prévia da transferência
    return {
      id: pixKey.id,
      type: pixKey.type,
      value: pixKey.value,
      account: {
        id: pixKey.account.id,
        accountNumber: pixKey.account.accountNumber,
        recipientName: pixKey.account.user.email.split('@')[0], // Nome simulado baseado no e-mail
        recipientEmail: pixKey.account.user.email,
      },
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover uma chave Pix' })
  @ApiResponse({ status: 204, description: 'Chave Pix removida com sucesso.' })
  @ApiResponse({ status: 403, description: 'Não autorizado a remover esta chave.' })
  @ApiResponse({ status: 404, description: 'Chave Pix não encontrada.' })
  async remove(@Param('id') id: string, @GetUser('id') userId: string) {
    await this.pixKeysService.remove(userId, id);
  }
}
