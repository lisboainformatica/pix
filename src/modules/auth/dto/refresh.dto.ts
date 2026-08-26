import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token ativo do usuário' })
  @IsString({ message: 'O refresh token deve ser uma string' })
  @IsNotEmpty({ message: 'O refresh token é obrigatório' })
  readonly refreshToken: string;
}
