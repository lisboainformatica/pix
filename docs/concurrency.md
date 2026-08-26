# Controle de Concorrência e Locks

Este documento detalha o tratamento de condições de corrida (Race Conditions) e deadlocks no processamento financeiro do simulador.

## O Desafio da Concorrência

Considere o seguinte cenário clássico de condição de corrida:
- Alice possui R$ 100.00 de saldo.
- Alice tenta fazer duas transferências simultâneas de R$ 80.00 e R$ 70.00 para Bob.
- Se o sistema ler o saldo de R$ 100.00 para ambas as requisições antes de salvar o débito, ambas as operações seriam aprovadas, deixando Alice com saldo de R$ -50.00 (inconsistência financeira).

## Estratégia Adotada: Pessimistic Locking

Para garantir consistência absoluta, implementamos bloqueio pessimista ao nível de linha utilizando **`SELECT ... FOR UPDATE`**.

Ao iniciar a transferência, a API inicia uma transação do banco de dados e executa:
```sql
SELECT id FROM "Account" WHERE id = $1 FOR UPDATE;
```
Esse comando bloqueia a linha da conta no PostgreSQL. Qualquer outra transação que tente ler ou escrever nessa linha ficará suspensa aguardando a transação atual fazer o `COMMIT` ou `ROLLBACK`.
O saldo só é lido e validado *depois* que os locks forem adquiridos, garantindo que o saldo seja sempre consistente e a validação seja confiável.

---

## Prevenção de Deadlocks

Um deadlock ocorre quando duas transações tentam adquirir locks cruzados ao mesmo tempo:
- Transação 1 (A -> B): Bloqueia A e aguarda liberação de B.
- Transação 2 (B -> A): Bloqueia B e aguarda liberação de A.
Nenhum dos dois processos avança e o banco de dados aborta uma das operações com erro de deadlock.

### Solução: Ordenação Física de Locks
Para mitigar isso, **ordenamos as contas envolvidas pelos seus IDs** antes de disparar os locks:
```typescript
const [firstId, secondId] = [senderAccountId, recipientAccountId].sort();
```
Isso garante que, independentemente de quem enviou o Pix (A para B ou B para A), ambas as requisições concorrentes sempre tentarão travar o menor ID primeiro e o maior ID depois. Se a Transação 1 bloquear o menor ID, a Transação 2 ficará pausada aguardando no primeiro lock, sem a possibilidade de travar o segundo e causar dependência circular (deadlock).

Nossos testes de e2e simulam transferências concorrentes cruzadas e comprovam que essa técnica previne deadlocks de forma eficaz.
