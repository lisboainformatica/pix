import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransferDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID da conta de origem' })
  @IsUUID('4', { message: 'ID da conta de origem deve ser um UUID válido' })
  @IsNotEmpty({ message: 'O ID da conta de origem é obrigatório' })
  readonly senderAccountId: string;

  @ApiProperty({ example: 'bob@example.com', description: 'Chave Pix de destino' })
  @IsString({ message: 'A chave de destino deve ser uma string' })
  @IsNotEmpty({ message: 'A chave de destino é obrigatória' })
  readonly destinationKey: string;

  @ApiProperty({ example: '50.00', description: 'Valor da transferência (em formato string decimal)' })
  @IsString({ message: 'O valor deve ser uma string decimal' })
  @IsNotEmpty({ message: 'O valor é obrigatório' })
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'O valor deve ser um número positivo válido com até 2 casas decimais' })
  readonly amount: string;

  @ApiProperty({ example: 'Pagamento de teste', description: 'Descrição opcional da transferência', required: false })
  @IsString({ message: 'A descrição deve ser uma string' })
  @IsOptional()
  readonly description?: string;
}
