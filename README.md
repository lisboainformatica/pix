# Simulador de Sistema de Pagamentos Instantâneos — Estilo Pix

> [!WARNING]
> **Aviso importante:** este projeto é exclusivamente educacional e foi desenvolvido para simular conceitos presentes em sistemas de pagamentos instantâneos.
>
> **Nenhuma transação financeira real é realizada.** O projeto não possui conexão com o SPI (Sistema de Pagamentos Instantâneos) do Banco Central, não utiliza APIs bancárias reais e não movimenta dinheiro de verdade.

## Sobre o projeto

Este projeto simula, em um ambiente controlado, o funcionamento de um sistema de pagamentos instantâneos semelhante ao Pix.

A ideia não é simplesmente criar uma API capaz de transferir valores entre duas contas. O principal objetivo é estudar os problemas que aparecem quando várias transferências acontecem simultaneamente e como um sistema financeiro precisa lidar com eles.

Entre os principais conceitos abordados estão:

* controle de concorrência;
* consistência das transações;
* prevenção de deadlocks;
* idempotência;
* autenticação e autorização;
* proteção contra acesso indevido a recursos;
* controle de requisições;
* persistência de dados;
* cache distribuído;
* testes automatizados;
* conteinerização;
* balanceamento de carga;
* escalabilidade horizontal.

Em outras palavras, o projeto busca responder a uma pergunta importante:

> **Como construir uma API de pagamentos que continue consistente e segura mesmo quando várias operações acontecem ao mesmo tempo?**

---

# 1. Tecnologias utilizadas

O projeto utiliza uma arquitetura baseada em Node.js e TypeScript, organizada em módulos através do NestJS.

### Backend

* **TypeScript** — linguagem principal do projeto.
* **Node.js** — ambiente de execução.
* **NestJS** — framework utilizado para estruturar a aplicação de forma modular.

### Banco de dados

* **PostgreSQL** — responsável pelo armazenamento permanente dos dados.
* **Prisma ORM** — utilizado para comunicação com o PostgreSQL, oferecendo tipagem e uma camada de acesso aos dados mais segura e organizada.
* **Redis** — utilizado para informações que precisam de acesso rápido e para mecanismos distribuídos, como rate limiting e controle de idempotência.

### Infraestrutura

* **Docker** — utilizado para criar ambientes isolados e reproduzíveis.
* **Docker Compose** — responsável por orquestrar os diferentes serviços da aplicação.
* **Nginx** — utilizado como Load Balancer para distribuir as requisições entre as instâncias da API.

### Segurança

O projeto também aplica algumas práticas importantes de segurança:

* **Argon2id** para armazenamento seguro de senhas;
* **JWT** para autenticação;
* **Refresh Tokens** para renovação da autenticação;
* **CORS** para controle de origens permitidas;
* **Helmet** para aplicação de headers de segurança;
* validação de dados de entrada;
* controle de acesso baseado no usuário autenticado;
* proteção contra problemas como **IDOR/BOLA**.

### Testes

Os testes são realizados utilizando:

* **Jest**;
* **Supertest**;
* testes unitários;
* testes de integração;
* testes E2E;
* testes específicos de concorrência e idempotência.

---

# 2. Estrutura do projeto

A aplicação segue uma arquitetura modular baseada nos recursos do NestJS.

```text
src/
│
├── modules/
│   ├── auth/
│   │   └── Registro, login, refresh token e autenticação JWT
│   │
│   ├── users/
│   │   └── Cadastro e consulta de usuários
│   │
│   ├── accounts/
│   │   └── Contas, saldos e operações de teste
│   │
│   ├── pix-keys/
│   │   └── Cadastro, consulta e remoção de chaves Pix simuladas
│   │
│   ├── transactions/
│   │   └── Transferências, estornos, locks e idempotência
│   │
│   └── health/
│       └── Health checks da aplicação
│
├── common/
│   ├── decorators/
│   │   └── Decorators compartilhados
│   │
│   ├── guards/
│   │   └── Proteção das rotas
│   │
│   ├── filters/
│   │   └── Tratamento padronizado de erros
│   │
│   ├── interceptors/
│   │   └── Logs e informações das requisições
│   │
│   └── middleware/
│       └── Request ID / Correlation ID
│
├── config/
│   └── Configurações e validação das variáveis de ambiente
│
└── database/
    └── PrismaService e RedisService
```

A separação por módulos facilita a manutenção e permite que cada parte do sistema tenha uma responsabilidade bem definida.

Por exemplo, o módulo `transactions` concentra as regras relacionadas às transferências, enquanto o módulo `auth` cuida exclusivamente da autenticação.

Isso evita que toda a lógica fique concentrada em um único arquivo ou serviço.

---

# 3. Por que algumas decisões técnicas são importantes?

## Argon2id em vez de bcrypt

Para armazenar senhas, o projeto utiliza **Argon2id**.

A senha do usuário nunca deve ser armazenada diretamente no banco de dados.

Em vez disso, o fluxo é aproximadamente:

```text
Senha informada pelo usuário
        ↓
     Argon2id
        ↓
Hash armazenado no banco
```

Quando o usuário faz login, a senha informada é comparada com o hash armazenado.

O objetivo é tornar muito mais difícil recuperar as senhas originais caso o banco de dados seja comprometido.

O Argon2id é uma escolha moderna e amplamente recomendada para armazenamento de senhas.

---

# 4. Como o sistema evita problemas de concorrência?

Essa é uma das partes mais importantes do projeto.

Imagine que uma conta possui:

```text
Saldo: R$ 1.000,00
```

Ao mesmo tempo, duas transferências tentam retirar R$ 800,00 dessa conta.

Se as duas operações simplesmente consultarem o saldo antes de atualizá-lo, podemos acabar com um problema:

```text
Transferência A → consulta saldo: R$ 1.000
Transferência B → consulta saldo: R$ 1.000

A → retira R$ 800
B → retira R$ 800
```

O resultado seria uma inconsistência financeira.

O sistema precisa garantir que operações concorrentes não consigam alterar o mesmo saldo de maneira incorreta.

Para isso, utilizamos **transações do PostgreSQL juntamente com locks pessimistas**.

---

# 5. Pessimistic Locking

Durante uma transferência, as contas envolvidas são bloqueadas dentro da transação utilizando o mecanismo:

```sql
SELECT id
FROM "Account"
WHERE id = $1
FOR UPDATE;
```

O `FOR UPDATE` informa ao PostgreSQL que aquela linha está sendo utilizada por uma operação que pretende modificá-la.

Enquanto a transação estiver em andamento, outra transação que tentar bloquear a mesma linha precisará aguardar.

Isso permite que o fluxo seja controlado de maneira segura:

```text
Início da transação
       ↓
Bloqueia as contas
       ↓
Consulta os saldos
       ↓
Valida o saldo disponível
       ↓
Debita a origem
       ↓
Credita o destino
       ↓
Registra a transação
       ↓
Commit
       ↓
Libera os locks
```

Se alguma etapa falhar, a transação pode ser revertida.

---

# 6. Como evitamos Deadlocks?

O uso de locks resolve um problema, mas cria outro possível problema: **deadlock**.

Imagine duas transferências acontecendo simultaneamente:

```text
Transferência 1:
A → B

Transferência 2:
B → A
```

Se cada operação bloquear primeiro sua própria conta:

```text
Transferência 1:
bloqueia A
aguarda B

Transferência 2:
bloqueia B
aguarda A
```

Temos uma situação circular:

```text
A aguarda B
B aguarda A
```

Nenhuma das duas operações consegue continuar.

## Solução: ordem determinística dos locks

Antes de bloquear as contas, seus IDs são ordenados:

```typescript
const [firstId, secondId] = [
  senderAccountId,
  recipientAccountId,
].sort();
```

Dessa maneira, independentemente de quem esteja enviando dinheiro para quem, as contas sempre serão bloqueadas na mesma ordem.

Por exemplo:

```text
Conta A = "001"
Conta B = "002"
```

As duas operações sempre tentarão:

```text
001 → primeiro
002 → segundo
```

Assim, eliminamos a condição de espera circular que poderia gerar o deadlock.

Os testes de concorrência do projeto verificam esse comportamento.

---

# 7. Idempotência: evitando transferências duplicadas

Outro problema importante em sistemas de pagamentos é a duplicação de requisições.

Imagine que o cliente envie uma transferência e, por algum motivo, não receba a resposta.

Ele pode tentar novamente.

Se o servidor simplesmente processar a segunda requisição, a mesma transferência poderá ser realizada duas vezes.

Para evitar isso, o cliente envia um identificador único:

```http
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Essa chave identifica aquela operação.

O fluxo funciona da seguinte maneira:

```text
Cliente envia transferência
        ↓
Servidor recebe Idempotency-Key
        ↓
Verifica se a chave já existe
        ↓
      Não existe
        ↓
Cria registro "RUNNING"
        ↓
Processa transferência
        ↓
Salva resultado
        ↓
Retorna resposta
```

Se outra requisição chegar utilizando a mesma chave:

```text
Mesma Idempotency-Key
        ↓
Chave já existe
        ↓
Verifica o estado da operação
        ↓
Retorna o resultado já processado
```

Isso evita que uma mesma operação seja executada duas vezes.

A restrição de unicidade no banco de dados é fundamental porque garante que duas requisições concorrentes não consigam registrar a mesma chave simultaneamente.

---

# 8. Redis e controle distribuído

O Redis é utilizado para operações que precisam de baixa latência e que podem ser compartilhadas entre várias instâncias da aplicação.

Um dos exemplos é o **rate limiting**.

Imagine que temos três instâncias:

```text
API 1
API 2
API 3
```

Se cada instância mantivesse seu próprio contador de requisições, um usuário poderia contornar facilmente o limite:

```text
API 1 → 10 requisições
API 2 → 10 requisições
API 3 → 10 requisições
```

Por isso, o controle precisa ser compartilhado.

O Redis funciona como uma camada centralizada para essas informações.

---

# 9. Arquitetura Stateless

A API foi projetada para ser **stateless**.

Isso significa que uma instância específica da API não precisa guardar informações importantes apenas em sua própria memória.

Por exemplo:

```text
             ┌─────────────┐
             │    Nginx    │
             └──────┬──────┘
                    │
          ┌─────────┼─────────┐
          ↓         ↓         ↓
       API 1      API 2      API 3
          │         │         │
          └─────────┼─────────┘
                    │
          ┌─────────┴─────────┐
          ↓                   ↓
     PostgreSQL             Redis
```

O Nginx distribui as requisições entre as instâncias da API.

Como os dados importantes estão armazenados em serviços compartilhados, qualquer instância pode processar uma requisição.

Isso permite aumentar a capacidade do sistema adicionando novas instâncias.

---

# 10. Load Balancing com Nginx

O Nginx atua como ponto de entrada da aplicação.

Em vez de o cliente acessar diretamente uma instância específica, ele acessa:

```text
http://localhost:8080
```

O Nginx recebe a requisição e decide para qual instância encaminhá-la.

Por exemplo:

```text
Requisição 1 → API 1
Requisição 2 → API 2
Requisição 3 → API 3
Requisição 4 → API 1
...
```

Esse comportamento é conhecido como **Round Robin**.

A vantagem é que podemos executar várias instâncias da aplicação simultaneamente.

---

# 11. O que acontece se uma API cair?

Imagine que temos:

```text
API 1 → funcionando
API 2 → caiu
API 3 → funcionando
```

O sistema continua podendo atender requisições utilizando as instâncias disponíveis.

Como a aplicação não depende de dados financeiros armazenados na memória de uma única instância, outra API pode assumir o processamento.

O JWT também pode ser validado independentemente por qualquer réplica, desde que todas utilizem as configurações de autenticação compatíveis.

Da mesma forma, informações compartilhadas, como dados persistentes e controles distribuídos, ficam fora da memória individual da API.

---

# 12. Variáveis de ambiente

As configurações da aplicação ficam fora do código-fonte.

Crie um arquivo `.env` na raiz do projeto utilizando o `.env.example` como referência:

```env
PORT=3000

NODE_ENV=development

DATABASE_URL="postgresql://pix_user:pix_password@127.0.0.1:5432/pix_db?schema=public"

REDIS_URL="redis://127.0.0.1:6379"

JWT_SECRET="development_jwt_secret_please_change_in_production"

JWT_EXPIRES_IN="15m"

REFRESH_TOKEN_SECRET="development_refresh_secret_please_change_in_production"

REFRESH_TOKEN_EXPIRES_IN="7d"

CORS_ORIGIN="*"
```

> [!IMPORTANT]
> Os valores acima são destinados ao ambiente de desenvolvimento. Em produção, segredos como `JWT_SECRET`, senhas de banco e credenciais do Redis devem ser armazenados utilizando mecanismos apropriados de gerenciamento de secrets.

---

# 13. Como executar o projeto

## Pré-requisitos

Para executar o projeto, recomenda-se ter instalado:

* Node.js 18 ou superior;
* Docker;
* Docker Compose.

O Node.js pode ser utilizado para executar a aplicação diretamente no ambiente local.

O Docker permite executar toda a infraestrutura necessária de maneira isolada.

---

## Executando a aplicação completa

Para iniciar:

* PostgreSQL;
* Redis;
* Nginx;
* três instâncias da API;

execute:

```bash
docker compose up -d --build
```

Depois que os containers estiverem executando, a aplicação estará disponível em:

```text
http://localhost:8080
```

O acesso pela porta `8080` passa pelo Nginx, que distribui as requisições entre as instâncias da API.

---

# 14. Executando em modo desenvolvimento

Também é possível executar a infraestrutura em containers e rodar a API diretamente no computador.

Primeiro, inicie PostgreSQL e Redis:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Depois instale as dependências:

```bash
npm install
```

Execute as migrations do Prisma:

```bash
npx prisma migrate dev --name init
```

E inicie a aplicação:

```bash
npm run start:dev
```

Nesse modo, a API estará disponível em:

```text
http://localhost:3000
```

---

# 15. Scripts disponíveis

Os principais comandos do projeto são:

```bash
# Inicia a aplicação
npm run start

# Inicia em modo desenvolvimento
npm run start:dev

# Compila o TypeScript para JavaScript
npm run build

# Executa o ESLint
npm run lint

# Formata o código
npm run format

# Executa os testes E2E
npm run test:e2e
```

O comando:

```bash
npm run build
```

compila o código TypeScript e gera a versão JavaScript na pasta:

```text
/dist
```

Essa pasta contém o código preparado para execução pelo Node.js.

---

# 16. Testes

Os testes são uma parte importante do projeto porque não basta implementar uma transferência que funciona em condições normais.

É necessário verificar também situações como:

* duas transferências simultâneas;
* transferência entre as mesmas contas;
* transferência em sentidos opostos;
* saldo insuficiente;
* requisições duplicadas;
* reutilização de uma `Idempotency-Key`;
* acesso a uma conta que pertence a outro usuário;
* tokens inválidos ou expirados;
* falhas durante uma transação;
* comportamento da API quando uma instância é interrompida.

Um dos objetivos dos testes é garantir que situações de concorrência não provoquem inconsistências no saldo.

---

# 17. Health Checks

O módulo `health` disponibiliza endpoints para verificar o estado da aplicação.

A ideia é diferenciar duas situações:

### Liveness

Responde à pergunta:

> **A aplicação está viva?**

### Readiness

Responde à pergunta:

> **A aplicação está pronta para receber requisições?**

Isso é especialmente importante em ambientes com containers e orquestração, porque permite identificar quando uma instância deve ou não receber tráfego.

---

# 18. Documentação da API

A API possui documentação interativa baseada em **Swagger/OpenAPI**.

Com a aplicação completa executando:

```text
http://localhost:8080/api/docs
```

Executando a API diretamente em desenvolvimento:

```text
http://localhost:3000/api/docs
```

A documentação permite visualizar:

* endpoints disponíveis;
* parâmetros;
* headers;
* payloads;
* respostas;
* códigos HTTP;
* modelos utilizados pela API.

Também é possível realizar chamadas diretamente pela interface do Swagger.

---

# 19. O que este projeto demonstra?

Embora seja um simulador, o projeto foi pensado para estudar problemas reais encontrados no desenvolvimento de sistemas distribuídos e APIs que precisam manter consistência.

Entre os principais conhecimentos demonstrados estão:


TypeScript
   ↓
Node.js + NestJS
   ↓
Arquitetura modular
   ↓
PostgreSQL + Prisma
   ↓
Transações
   ↓
Controle de concorrência
   ↓
Locks e prevenção de deadlocks
   ↓
Idempotência
   ↓
Redis
   ↓
Autenticação e autorização
   ↓
Docker
   ↓
Nginx
   ↓
Escalabilidade horizontal
   ↓
Testes automatizados


O objetivo final não é apenas criar uma API que "transfere dinheiro".

É entender **como projetar um sistema que continue confiável quando várias coisas acontecem ao mesmo tempo**.

Esse é justamente um dos principais desafios de sistemas de pagamentos: não basta que uma operação funcione quando executada isoladamente. É necessário garantir que o comportamento continue correto diante de concorrência, falhas, requisições duplicadas e múltiplas instâncias da aplicação.
