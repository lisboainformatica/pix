# Escalabilidade Horizontal e Topologia

Este documento descreve como o sistema foi arquitetado para rodar de forma distribuída com múltiplas instâncias concorrentes.

## Topologia de Rede (Docker Compose)

O ambiente produtivo simulado no `docker-compose.yml` possui a seguinte estrutura:

```
                  ┌───────────────┐
                  │    Cliente    │
                  └───────┬───────┘
                          │ (Port 8080)
                          ▼
                  ┌───────────────┐
                  │  Nginx Proxy  │
                  └───────┬───────┘
            ┌─────────────┼─────────────┐ (Round Robin)
            ▼             ▼             ▼
       ┌─────────┐   ┌─────────┐   ┌─────────┐
       │  API 1  │   │  API 2  │   │  API 3  │ (Port 3000)
       └────┬────┘   └────┬────┘   └────┬────┘
            │             │             │
            └─────────────┼─────────────┘
                    ┌─────┴─────┐
                    ▼           ▼
             ┌──────────┐   ┌───────┐
             │ Postgres │   │ Redis │
             └──────────┘   └───────┘
```

1. **Nginx (Load Balancer)**: Recebe chamadas na porta `8080` e distribui por Round Robin entre as instâncias `api-1`, `api-2` e `api-3`.
2. **Stateless API**: Os nós da API não armazenam nenhum estado local na memória do processo Node.js.
   - O saldo financeiro e as tabelas de estado ficam exclusivamente no **PostgreSQL** (fonte da verdade de dados persistentes).
   - O cache de rate limit fica no **Redis** (fonte da verdade de estados rápidos/voláteis).
   - As sessões e tokens JWT são validados por assinatura criptográfica simétrica contendo o ID e informações do usuário no payload. Desta forma, qualquer instância da API pode validar de forma independente qualquer request de um usuário autenticado.

---

## Health Checks da Aplicação

Implementamos liveness e readiness probes na API expostos sob a rota `/health`.

- **Liveness (`GET /health/live`)**: Valida se o processo da API está ativo e respondendo chamadas. Retorna `200 OK` se o servidor NestJS estiver escutando.
- **Readiness (`GET /health/ready`)**: Verifica se as dependências essenciais estão prontas para processar chamadas de negócio. Ele testa ativamente:
  - Conexão de leitura/escrita no banco **PostgreSQL** via Prisma.
  - Conectividade com o servidor **Redis**.
  Se qualquer uma das dependências falhar, o Readiness probe responde com erro `503 Service Unavailable`, sinalizando ao Load Balancer ou Kubernetes que a instância deve ser removida da rota de tráfego de usuários até se recuperar.
