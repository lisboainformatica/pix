import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com', description: 'E-mail do usuário' })
  @IsEmail({}, { message: 'E-mail inválido' })
  readonly email: string;

  @ApiProperty({ example: 'password123', description: 'Senha do usuário' })
  @IsString({ message: 'A senha deve ser uma string' })
  @MinLength(6, { message: 'A senha deve conter no mínimo 6 caracteres' })
  readonly password: string;
}
