import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DepositDto {
  @ApiProperty({ example: '100.50', description: 'Valor monetário em formato string decimal' })
  @IsString({ message: 'O valor deve ser uma string decimal' })
  @IsNotEmpty({ message: 'O valor é obrigatório' })
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'O valor deve ser um número decimal válido com até 2 casas decimais' })
  readonly amount: string;
}
