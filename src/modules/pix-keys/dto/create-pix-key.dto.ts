import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PixKeyType } from '@prisma/client';

export class CreatePixKeyDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID da conta vinculada' })
  @IsUUID('4', { message: 'ID da conta deve ser um UUID válido' })
  @IsNotEmpty({ message: 'O ID da conta é obrigatório' })
  readonly accountId: string;

  @ApiProperty({ enum: PixKeyType, example: 'EMAIL', description: 'Tipo da chave Pix' })
  @IsEnum(PixKeyType, { message: 'Tipo de chave Pix inválido' })
  @IsNotEmpty({ message: 'O tipo da chave é obrigatório' })
  readonly type: PixKeyType;

  @ApiProperty({ example: 'alice@example.com', description: 'Valor da chave Pix' })
  @IsString({ message: 'O valor da chave deve ser uma string' })
  @IsNotEmpty({ message: 'O valor da chave é obrigatório' })
  readonly value: string;
}
