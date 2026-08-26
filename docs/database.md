# Modelagem do Banco de Dados

O banco de dados utiliza PostgreSQL. A modelagem garante integridade referencial, restrições e performance de busca através de índices selecionados.

## Diagrama Físico do Schema (Prisma)

- `User`: Cadastro básico de usuários.
- `Account`: Contas vinculadas a usuários. O saldo (`balance`) é armazenado como tipo `Decimal(20, 2)` (numeric no PostgreSQL), prevenindo erros de arredondamento de float.
- `PixKey`: Chaves Pix. Possui restrição de unicidade (`unique`) sobre o valor (`value`), impedindo que duas contas possuam a mesma chave.
- `Transaction`: Histórico completo de movimentações.
- `AuditLog`: Registro estruturado de eventos de segurança.
- `RefreshToken`: Controle de sessões ativas por hash do token.
- `Idempotency`: Controle transacional de idempotência por UUID.

---

## Índices de Performance Criados

Os seguintes índices foram definidos no schema do Prisma:

1. **`Account(userId)`**: Acelera a consulta de contas pertencentes a um usuário específico (`GET /accounts`).
2. **`PixKey(value)`**: Acelera a resolução rápida de chaves Pix para obter a conta do destinatário (`GET /pix/keys/:key`).
3. **`Transaction(senderAccountId, recipientAccountId)`**: Otimiza a renderização de extratos e históricos (`GET /pix/transfers`).
4. **`Transaction(status)`**: Permite filtragem eficiente de transações por estado para auditorias e reconciliações.
5. **`Transaction(createdAt)`**: Otimiza ordenações temporais (`ORDER BY createdAt DESC`) para listagens.
6. **`RefreshToken(token)`**: Acelera a validação e revogação do refresh token no banco de dados.
7. **`AuditLog(userId, createdAt)`**: Acelera consultas de segurança e trilha de auditoria de usuários.

---

## Regras de Integridade e Constraints

- **Foreign Keys**: Garantem consistência. Por exemplo, deletar um `User` dispara a remoção em cascata (`onDelete: Cascade`) de suas `Account` e `RefreshToken`.
- **Unique Constraints**: O e-mail do usuário e o valor da chave Pix possuem restrições únicas para impedir cadastros duplicados ao nível do banco (mesmo sob concorrência).
