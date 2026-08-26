import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { env } from '../src/config/env.config';
import { randomUUID } from 'crypto';

describe('Sistema Pix (E2E, Concorrência e Idempotência)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Limpa o banco de dados antes de cada teste para garantir isolamento e reprodutibilidade
    await prisma.idempotency.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.pixKey.deleteMany();
    await prisma.account.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Fluxo Principal de Negócio (ETAPA 14 - E2E)', () => {
    it('deve realizar o fluxo completo de registro, login, criação de conta, depósito, vinculação de chave e transferência Pix', async () => {
      // 1. Criar Usuário A e Usuário B
      const userARegister = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'alice.test@example.com', password: 'password123' })
        .expect(201);

      const userBRegister = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'bob.test@example.com', password: 'password123' })
        .expect(201);

      // 2. Fazer Login e obter tokens
      const loginA = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'alice.test@example.com', password: 'password123' })
        .expect(200);

      const loginB = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'bob.test@example.com', password: 'password123' })
        .expect(200);

      const tokenA = loginA.body.accessToken;
      const tokenB = loginB.body.accessToken;

      // 3. Criar Contas para Alice e Bob
      const accountA = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(201);

      const accountB = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(201);

      const accountAId = accountA.body.id;
      const accountBId = accountB.body.id;

      // 4. Testar proteção IDOR/BOLA: Alice tenta acessar a conta do Bob
      await request(app.getHttpServer())
        .get(`/accounts/${accountBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403); // Forbidden

      // 5. Depositar saldo fictício para Alice (R$ 500.00)
      await request(app.getHttpServer())
        .post(`/accounts/${accountAId}/deposit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: '500.00' })
        .expect(201);

      // 6. Cadastrar Chave Pix para Bob (E-mail dele)
      const pixKeyB = await request(app.getHttpServer())
        .post('/pix/keys')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          accountId: accountBId,
          type: 'EMAIL',
          value: 'bob.test@example.com',
        })
        .expect(201);

      // 7. Alice consulta a chave Pix do Bob para visualização dos dados (Resolução de chave)
      const resolvedKey = await request(app.getHttpServer())
        .get(`/pix/keys/bob.test@example.com`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(resolvedKey.body.account.recipientEmail).toBe('bob.test@example.com');

      // 8. Alice transfere R$ 150.50 para Bob
      const transfer = await request(app.getHttpServer())
        .post('/pix/transfers')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          senderAccountId: accountAId,
          destinationKey: 'bob.test@example.com',
          amount: '150.50',
          description: 'Presente de aniversario',
        })
        .expect(201);

      expect(transfer.body.status).toBe('COMPLETED');

      // 9. Verificar saldos atualizados
      const updatedAccountA = await request(app.getHttpServer())
        .get(`/accounts/${accountAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const updatedAccountB = await request(app.getHttpServer())
        .get(`/accounts/${accountBId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(Number(updatedAccountA.body.balance)).toBe(349.50); // 500.00 - 150.50
      expect(Number(updatedAccountB.body.balance)).toBe(150.50); // 0.00 + 150.50
    });
  });

  describe('Idempotência de Transações (ETAPA 11 e 21)', () => {
    it('deve retornar o resultado em cache para chamadas duplicadas com a mesma chave', async () => {
      // Usaremos o fluxo de API completo para criar os usuários reais com hashes corretos para autenticação
      const registerA = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'alice.idemp2@example.com', password: 'password123' });
      const registerB = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'bob.idemp2@example.com', password: 'password123' });

      const loginA = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'alice.idemp2@example.com', password: 'password123' });
      const loginB = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'bob.idemp2@example.com', password: 'password123' });

      const tokenA = loginA.body.accessToken;
      const tokenB = loginB.body.accessToken;

      const accA = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenA}`);
      const accB = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenB}`);

      const accAId = accA.body.id;
      const accBId = accB.body.id;

      // Depositar saldo
      await request(app.getHttpServer())
        .post(`/accounts/${accAId}/deposit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: '500.00' });

      // Registrar chave
      await request(app.getHttpServer())
        .post('/pix/keys')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ accountId: accBId, type: 'EMAIL', value: 'bob.idemp2@example.com' });

      const idempotencyKey = randomUUID();

      // Envia a primeira requisição de transferência
      const res1 = await request(app.getHttpServer())
        .post('/pix/transfers')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('idempotency-key', idempotencyKey)
        .send({
          senderAccountId: accAId,
          destinationKey: 'bob.idemp2@example.com',
          amount: '80.00',
          description: 'Compra de livro',
        });

      expect(res1.status).toBe(201);
      const originalTxId = res1.body.id;

      // Envia a segunda requisição idêntica com o mesmo Idempotency-Key
      const res2 = await request(app.getHttpServer())
        .post('/pix/transfers')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('idempotency-key', idempotencyKey)
        .send({
          senderAccountId: accAId,
          destinationKey: 'bob.idemp2@example.com',
          amount: '80.00',
          description: 'Compra de livro',
        });

      // Deve retornar o mesmo status (201) e o mesmo ID de transação (retorno do cache)
      expect(res2.status).toBe(201);
      expect(res2.body.id).toBe(originalTxId);

      // Validar que o saldo foi debitado apenas uma vez (500 - 80 = 420)
      const finalAccA = await request(app.getHttpServer())
        .get(`/accounts/${accAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(Number(finalAccA.body.balance)).toBe(420.00);
    });

    it('deve lidar corretamente com requisições concorrentes idênticas', async () => {
      // Criação de usuários e chaves
      const registerA = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'alice.idemp3@example.com', password: 'password123' });
      const registerB = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'bob.idemp3@example.com', password: 'password123' });

      const loginA = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'alice.idemp3@example.com', password: 'password123' });
      const loginB = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'bob.idemp3@example.com', password: 'password123' });

      const tokenA = loginA.body.accessToken;
      const tokenB = loginB.body.accessToken;

      const accA = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenA}`);
      const accB = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenB}`);

      const accAId = accA.body.id;
      const accBId = accB.body.id;

      await request(app.getHttpServer())
        .post(`/accounts/${accAId}/deposit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: '500.00' });

      await request(app.getHttpServer())
        .post('/pix/keys')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ accountId: accBId, type: 'EMAIL', value: 'bob.idemp3@example.com' });

      const idempotencyKey = randomUUID();

      // Dispara 2 requisições em paralelo ao mesmo tempo
      const reqPromise1 = request(app.getHttpServer())
        .post('/pix/transfers')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('idempotency-key', idempotencyKey)
        .send({
          senderAccountId: accAId,
          destinationKey: 'bob.idemp3@example.com',
          amount: '120.00',
        });

      const reqPromise2 = request(app.getHttpServer())
        .post('/pix/transfers')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('idempotency-key', idempotencyKey)
        .send({
          senderAccountId: accAId,
          destinationKey: 'bob.idemp3@example.com',
          amount: '120.00',
        });

      const [res1, res2] = await Promise.all([reqPromise1, reqPromise2]);

      // Espera-se que uma delas tenha sucesso (201) e a outra retorne conflito (409) ou o resultado cached se a primeira acabou extremamente rápido.
      // O importante é que a transação de débito no banco ocorra exatamente UMA única vez.
      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      
      const finalAccA = await request(app.getHttpServer())
        .get(`/accounts/${accAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      // Saldo deve ser 500 - 120 = 380, e nunca 500 - 240 = 260
      expect(Number(finalAccA.body.balance)).toBe(380.00);
    });
  });

  describe('Concorrência e Race Conditions (ETAPA 6, 10 e 22)', () => {
    it('deve suportar concorrência extrema: saldo R$ 100, 10 requisições simultâneas de R$ 20. Exatamente 5 devem passar', async () => {
      // Criação de usuários e chaves
      const registerA = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'alice.race@example.com', password: 'password123' });
      const registerB = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'bob.race@example.com', password: 'password123' });

      const loginA = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'alice.race@example.com', password: 'password123' });
      const loginB = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'bob.race@example.com', password: 'password123' });

      const tokenA = loginA.body.accessToken;
      const tokenB = loginB.body.accessToken;

      const accA = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenA}`);
      const accB = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenB}`);

      const accAId = accA.body.id;
      const accBId = accB.body.id;

      // Alice inicia exatamente com R$ 100.00
      await request(app.getHttpServer())
        .post(`/accounts/${accAId}/deposit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: '100.00' });

      // Bob cria chave
      await request(app.getHttpServer())
        .post('/pix/keys')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ accountId: accBId, type: 'EMAIL', value: 'bob.race@example.com' });

      // Dispara 10 requisições simultâneas de R$ 20.00 cada (sem usar a mesma Idempotency-Key para cada uma,
      // pois queremos testar a concorrência pura no saldo, e não a idempotência da mesma transferência)
      const transferPromises = Array.from({ length: 10 }).map(() =>
        request(app.getHttpServer())
          .post('/pix/transfers')
          .set('Authorization', `Bearer ${tokenA}`)
          .set('idempotency-key', randomUUID()) // Cada transferência possui sua própria idempotency-key para ser tratada como operação distinta
          .send({
            senderAccountId: accAId,
            destinationKey: 'bob.race@example.com',
            amount: '20.00',
          })
      );

      const responses = await Promise.all(transferPromises);

      // Conta quantas transações foram bem sucedidas
      const successCount = responses.filter(r => r.status === 201).length;
      const failureCount = responses.filter(r => r.status === 400).length; // 400 Bad Request por saldo insuficiente

      expect(successCount).toBe(5); // Exatamente 5 transferências (5 * 20 = 100)
      expect(failureCount).toBe(5); // Outras 5 falham

      // Validar saldo final da Alice (deve ser R$ 0.00, nunca negativo)
      const finalAccA = await request(app.getHttpServer())
        .get(`/accounts/${accAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(Number(finalAccA.body.balance)).toBe(0.00);

      // Validar saldo final do Bob (deve ser R$ 100.00)
      const finalAccB = await request(app.getHttpServer())
        .get(`/accounts/${accBId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(Number(finalAccB.body.balance)).toBe(100.00);
    });

    it('deve evitar deadlocks em transferências concorrentes cruzadas (A -> B e B -> A)', async () => {
      // Criação de usuários e chaves
      const registerA = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'alice.dead@example.com', password: 'password123' });
      const registerB = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'bob.dead@example.com', password: 'password123' });

      const loginA = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'alice.dead@example.com', password: 'password123' });
      const loginB = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'bob.dead@example.com', password: 'password123' });

      const tokenA = loginA.body.accessToken;
      const tokenB = loginB.body.accessToken;

      const accA = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenA}`);
      const accB = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenB}`);

      const accAId = accA.body.id;
      const accBId = accB.body.id;

      // Alice e Bob iniciam com R$ 200.00 cada
      await request(app.getHttpServer())
        .post(`/accounts/${accAId}/deposit`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ amount: '200.00' });

      await request(app.getHttpServer())
        .post(`/accounts/${accBId}/deposit`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ amount: '200.00' });

      // Criar chaves
      await request(app.getHttpServer())
        .post('/pix/keys')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ accountId: accAId, type: 'EMAIL', value: 'alice.dead@example.com' });

      await request(app.getHttpServer())
        .post('/pix/keys')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ accountId: accBId, type: 'EMAIL', value: 'bob.dead@example.com' });

      // Dispara simultaneamente:
      // - Alice transferindo R$ 50 para Bob
      // - Bob transferindo R$ 50 para Alice
      // Sem ordenação de IDs, isso geraria deadlock muito facilmente sob concorrência.
      const t1 = request(app.getHttpServer())
        .post('/pix/transfers')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('idempotency-key', randomUUID())
        .send({ senderAccountId: accAId, destinationKey: 'bob.dead@example.com', amount: '50.00' });

      const t2 = request(app.getHttpServer())
        .post('/pix/transfers')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('idempotency-key', randomUUID())
        .send({ senderAccountId: accBId, destinationKey: 'alice.dead@example.com', amount: '50.00' });

      const [resA, resB] = await Promise.all([t1, t2]);

      // Ambas devem ter sucesso sem deadlock
      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);

      // Saldos finais devem permanecer em R$ 200.00 cada (200 - 50 + 50 = 200)
      const finalAccA = await request(app.getHttpServer())
        .get(`/accounts/${accAId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      const finalAccB = await request(app.getHttpServer())
        .get(`/accounts/${accBId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(Number(finalAccA.body.balance)).toBe(200.00);
      expect(Number(finalAccB.body.balance)).toBe(200.00);
    });
  });
});
