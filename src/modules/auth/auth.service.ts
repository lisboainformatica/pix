import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import * as argon2 from 'argon2';
import { env } from '../../config/env.config';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async register(email: string, password: string) {
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      // Custom error code: USER_ALREADY_EXISTS / ConflictException
      throw new ConflictException('Usuário já cadastrado');
    }

    // OWASP: Argon2id hashing
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    const user = await this.usersService.create(email, passwordHash);

    // Omitimos a senha no retorno
    const { passwordHash: _, ...result } = user;
    return result;
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.generateTokens(user.id, user.email);
  }

  async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN as any,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: env.REFRESH_TOKEN_SECRET,
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as any,
    });

    // Salva o Refresh Token no banco de dados para controle de sessão/revogação
    const expiresAt = new Date();
    // Ex: "7d" -> adiciona 7 dias. Tratamento simples de expiração
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: await argon2.hash(refreshToken), // Armazena hash do token para segurança caso o DB seja vazado
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    try {
      // Valida a assinatura do token
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: env.REFRESH_TOKEN_SECRET,
      });

      // Busca os active refresh tokens para este usuário
      const tokens = await this.prisma.refreshToken.findMany({
        where: {
          userId: payload.sub,
          revoked: false,
          expiresAt: { gt: new Date() },
        },
      });

      // Valida se o refresh token enviado confere com algum hash armazenado no banco
      let matchedTokenId: string | null = null;
      for (const tokenEntity of tokens) {
        const isValid = await argon2.verify(tokenEntity.token, refreshToken);
        if (isValid) {
          matchedTokenId = tokenEntity.id;
          break;
        }
      }

      if (!matchedTokenId) {
        throw new UnauthorizedException('Refresh token inválido ou revogado');
      }

      // Revoga o token atual (Token Rotation para prevenir Replay Attacks)
      await this.prisma.refreshToken.update({
        where: { id: matchedTokenId },
        data: { revoked: true },
      });

      // Gera novo par de tokens
      return this.generateTokens(payload.sub, payload.email);
    } catch (e) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: env.REFRESH_TOKEN_SECRET,
      });

      const tokens = await this.prisma.refreshToken.findMany({
        where: {
          userId: payload.sub,
          revoked: false,
        },
      });

      // Apenas revoga se encontrar o hash batendo
      for (const tokenEntity of tokens) {
        const isValid = await argon2.verify(tokenEntity.token, refreshToken);
        if (isValid) {
          await this.prisma.refreshToken.update({
            where: { id: tokenEntity.id },
            data: { revoked: true },
          });
          break;
        }
      }
    } catch (e) {
      // Falha silenciosa no logout para evitar enumeration de token
    }
  }
}
