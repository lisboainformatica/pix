# Mecanismo de Idempotência

Este documento descreve como garantimos a idempotência em operações financeiras críticas no simulador de Pix.

## Por que Idempotência?

Se um cliente envia uma requisição de transferência e a conexão de rede cai antes de ele receber o retorno, ele não sabe se a transferência foi efetuada. Se ele tentar novamente, pode transferir o dinheiro duas vezes por engano.
A idempotência resolve isso garantindo que chamadas idênticas repetidas produzam exatamente o mesmo efeito que a primeira chamada.

---

## Estrutura da Tabela de Idempotência

Criamos a tabela `Idempotency` com a seguinte estrutura:
- `key` (String, PK): A chave UUID de idempotência enviada pelo cliente no header `Idempotency-Key`.
- `status` (Enum: `RUNNING`, `COMPLETED`): O estado atual do processamento da requisição.
- `responseStatus` (Int?): O status HTTP retornado na chamada original (ex: 201).
- `responseBody` (String?): O JSON serializado retornado como resposta original.
- `createdAt`, `updatedAt` (DateTime): Controle de auditoria de data.

---

## Máquina de Estados e Fluxo

```
[Cliente envia request com Idempotency-Key]
                       │
                       ▼
            [Tenta inserir no Banco]
             /                   \
        (Sucesso)              (Erro P2002 - Chave existe)
           /                       \
          ▼                         ▼
   [status = RUNNING]       [status == RUNNING?]
          │                     /         \
  [Executa transação]      (Sim)         (Não)
    /           \           /               \
 (Sucesso)     (Erro)      ▼                 ▼
   /               \   [Retorna 409]  [Retorna resposta em cache]
  ▼                 ▼
[status=COMPLETED] [Deleta chave]
[Salva response]
```

1. **Tentativa de Inserção**: O middleware tenta inserir a chave com status `RUNNING`. Graças à restrição de chave primária (`key`), o PostgreSQL garante atomicidade: apenas uma requisição consegue inserir.
2. **Duplicidade Concorrente**: Se outra requisição com a mesma chave chegar enquanto a primeira está rodando, ela causará erro de unicidade e detectará o status `RUNNING`, retornando imediatamente `409 Conflict / TRANSACTION_IN_PROGRESS`.
3. **Duplicidade Tardia**: Se a primeira requisição já terminou, a tabela terá status `COMPLETED` e os dados de resposta salvos. A API apenas lê essa linha e devolve a resposta cacheada instantaneamente com status `201 Created` sem executar a transação financeira novamente.
4. **Tratamento de Falhas**: Se a transferência falhar (ex: saldo insuficiente), a chave de idempotência é **removida** para permitir que o usuário faça depósitos e tente enviar a transferência novamente após corrigir a entrada.
