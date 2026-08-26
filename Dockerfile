# Stage 1: Build
FROM node:20-alpine AS builder
# Instala ferramentas necessárias para compilar dependências nativas (como o argon2)
RUN apk add --no-cache python3 make g++ gcc
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npx prisma generate
RUN npm run build
# Remove dependências de desenvolvimento após o build para reduzir o tamanho de produção
RUN npm prune --production --legacy-peer-deps

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Copia node_modules compilado e podado do builder para evitar reinstalar dependências nativas
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Executa migrações pendentes usando o CLI local do Prisma (evitando baixar versão 7 incompatível) e depois inicia a aplicação
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && node dist/src/main"]
