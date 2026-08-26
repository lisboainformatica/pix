# Arquitetura do Sistema (Simulador Pix)

Este documento detalha as decisões arquiteturais do sistema, explicando a organização de pastas, o fluxo de dados e a topologia de execução.

## Estrutura de Diretórios

O sistema segue uma arquitetura modularizada, separando responsabilidades de forma que cada componente tenha escopo claro.

```
src/
├── modules/
│   ├── auth/          # Registro, login, refresh token, estratégias JWT
│   ├── users/         # Serviços de consulta e persistência de dados de usuários
│   ├── accounts/      # Contas bancárias simuladas e depósitos fictícios
│   ├── pix-keys/      # Cadastro, remoção e resolução de chaves Pix
│   ├── transactions/  # Execução de transferências, concorrência, idempotência e estornos
│   └── health/        # Liveness e Readiness probes
│
├── common/            # Compartilhado por múltiplos módulos
│   ├── decorators/    # Decorator GetUser para extrair metadados do request
│   ├── guards/        # Guardas de autenticação (JWT)
│   ├── filters/       # HttpExceptionFilter para tratamento centralizado de erros
│   ├── interceptors/  # LoggingInterceptor para logs estruturados JSON
│   └── middleware/    # RequestIdMiddleware para correlação de logs
│
├── config/            # Validação e carregamento de variáveis de ambiente
├── database/          # PrismaService global e inicialização da conexão
└── main.ts            # Arquivo de inicialização e bootstrapping do NestJS
```

### Raciocínio das Pastas
- **`modules/`**: Cada subpasta representa um contexto ou recurso de domínio do sistema. Isso permite evolução isolada: se o recurso de chaves Pix mudar, as modificações afetam predominantemente a pasta `pix-keys/`.
- **`common/`**: Contém middlewares, guards e interceptores que agem transversalmente a toda a aplicação. Regras de segurança gerais pertencem a este diretório.
- **`config/`**: Centraliza a validação das variáveis do `.env` no startup usando schemas Zod. Evita que o sistema suba parcialmente configurado.

## Fluxo de Execução de uma Transferência

```
[Cliente] -> [Nginx (Port 8080)] -> [API Node Instance] -> [DB Transaction]
```

1. **Load Balancing**: Nginx recebe a chamada na porta 8080 e repassa para uma das três réplicas (api-1, api-2 ou api-3) via Round Robin.
2. **Autenticação**: O `JwtAuthGuard` valida o header `Authorization`.
3. **Idempotência**: O interceptor/serviço busca a chave de idempotência fornecida no header. Se concluída, retorna em cache. Se em execução, lança `409 Conflict`. Caso contrário, registra como `RUNNING`.
4. **Resolução de Chave**: Busca a chave Pix de destino para descobrir a conta do destinatário.
5. **Locks e Ordenação**: Ordena os IDs das duas contas envolvidas (remetente e destinatário) e faz lock pessimista das linhas usando `SELECT ... FOR UPDATE` para evitar race conditions e deadlocks.
6. **Movimentação**: Valida saldo, faz o débito na conta de origem, o crédito na conta de destino, grava o extrato, a auditoria e commita a transação.
7. **Cache de Idempotência**: Grava o JSON de resposta final na tabela de idempotência e retorna `201 Created` para o cliente.
