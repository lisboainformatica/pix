import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obter dados do usuário logado' })
  @ApiResponse({ status: 200, description: 'Dados do usuário retornado com sucesso.' })
  @ApiResponse({ status: 401, description: 'Não autenticado.' })
  async getMe(@GetUser('id') userId: string) {
    const user = await this.usersService.findById(userId);
    // Remove o hash de senha para segurança antes de responder
    const { passwordHash: _, ...result } = user!;
    return result;
  }
}
