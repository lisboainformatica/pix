# Segurança da API

Este simulador foi projetado com múltiplas camadas de segurança baseadas em recomendações da OWASP.

## Ataques Mitigados

### 1. SQL Injection
- **Mitigação**: O uso do Prisma ORM parametriza todas as consultas por padrão. Nas consultas brutas (Raw SQL) necessárias para lock pessimista (`SELECT FOR UPDATE`), usamos os template literals do Prisma (`prisma.$queryRaw`), que são compilados como consultas parametrizadas seguras no driver PostgreSQL.
- **Risco mitigado**: Injeção de DDL/DML arbitrária pelo atacante.

### 2. IDOR / BOLA (Broken Object Level Authorization)
- **Mitigação**: O sistema valida se o usuário autenticado (`req.user.id`) possui autorização física sobre o ID do recurso solicitado. Por exemplo, ao detalhar uma conta (`GET /accounts/:id`) ou realizar uma transferência (`POST /pix/transfers`), o serviço valida explicitamente se a conta de origem pertence ao usuário autenticado.
- **Risco mitigado**: Usuário A acessando saldos ou transferindo dinheiro da conta do Usuário B sabendo apenas o ID da conta.

### 3. JWT Theft e Replay Attacks
- **Mitigação**: Os Access Tokens têm vida curta (15 minutos). Os Refresh Tokens são de uso único e armazenados no banco de dados como hashes Argon2id para proteção contra vazamentos de banco. O sistema implementa **Token Rotation (Rotação de Tokens)**: ao renovar a sessão (`POST /auth/refresh`), o refresh token antigo é revogado e um novo par é gerado. Se o token antigo for reutilizado por um atacante, o sistema detecta que já foi revogado e invalida todas as sessões do usuário.
- **Risco mitigado**: Sessões persistentes roubadas e mantidas ativas indefinidamente por invasores.

### 4. Brute Force & Rate Limit Abuse
- **Mitigação**: Configuração de Rate Limiting global através do `@nestjs/throttler` integrado ao Redis. O Redis serve como store central de conexões. Qualquer IP/cliente que exceder 100 requisições por minuto é bloqueado temporariamente com status `429 Too Many Requests`.
- **Risco mitigado**: Ataques automatizados de descoberta de senhas (credential stuffing) e negação de serviço (DoS).

### 5. Senhas Fracas & GPU Cracking
- **Mitigação**: Senhas são hashadas usando o algoritmo **Argon2id** (OWASP recommendation). É configurado para ser resistente a ataques concorrentes em paralelo usando hardware customizado (GPUs/ASICs).
- **Risco mitigado**: Ataques de dicionário e brute force offline de hashes de senhas.

### 6. Vulnerabilidades Web Comuns (Headers HTTP)
- **Mitigação**: Integração do middleware `helmet` no bootstrap da API, inserindo cabeçalhos padrão como `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, e `Content-Security-Policy`.
