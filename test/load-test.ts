import { randomUUID } from 'crypto';

const TARGET_URL = 'http://localhost:8080';
const NUM_USERS = 100;
const TRANSFER_AMOUNT = '15.50';
const BATCH_SIZE = 10; // Batch size to prevent TCP socket drops (ECONNRESET) on loopback

interface UserSession {
  email: string;
  token: string;
  accountId: string;
  pixKey: string;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Executa promessas em lotes para evitar sobrecarregar a rede loopback local
async function runInBatches<T, R>(items: T[], batchSize: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item, index) => fn(item, i + index))
    );
    results.push(...batchResults);
    await sleep(30); // Pequeno cooldown para liberar sockets
  }
  return results;
}

async function main() {
  console.log(`🔥 ====================================================`);
  console.log(`🔥 INICIANDO TESTE DE CARGA CONCORRENTE: ${NUM_USERS} USUÁRIOS`);
  console.log(`🔥 URL Alvo: ${TARGET_URL}`);
  console.log(`🔥 Lotes de Concorrência: ${BATCH_SIZE}`);
  console.log(`🔥 ====================================================\n`);

  // --- ETAPA 1: Registro de Usuários ---
  console.log(`[1/6] Registrando ${NUM_USERS} usuários em lotes...`);
  const userIndexes = Array.from({ length: NUM_USERS }).map((_, i) => i + 1);
  
  const emails = await runInBatches(userIndexes, BATCH_SIZE, async (num) => {
    const email = `load.user${num}@example.com`;
    const password = 'password123';
    try {
      const res = await fetch(`${TARGET_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.status !== 201 && res.status !== 409) {
        throw new Error(`Falha no registro: ${res.status}`);
      }
      return email;
    } catch (e) {
      console.error(`Erro ao registrar ${email}, tentando novamente...`);
      await sleep(100);
      // Retry simples
      const res = await fetch(`${TARGET_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      });
      return email;
    }
  });
  console.log(`   ✅ Registro concluído.\n`);

  // --- ETAPA 2: Login e Geração de Tokens ---
  console.log(`[2/6] Realizando login dos ${NUM_USERS} usuários em lotes...`);
  const tokens = await runInBatches(emails, BATCH_SIZE, async (email) => {
    try {
      const res = await fetch(`${TARGET_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      });
      if (!res.ok) throw new Error(`Falha no login: ${res.status}`);
      const data = await res.json();
      return { email, token: data.accessToken };
    } catch (e) {
      console.error(`Erro no login de ${email}:`, e);
      throw e;
    }
  });
  console.log(`   ✅ Tokens JWT obtidos.\n`);

  // --- ETAPA 3: Criação de Contas ---
  console.log(`[3/6] Criando contas bancárias em lotes...`);
  const withAccounts = await runInBatches(tokens, BATCH_SIZE, async (u) => {
    try {
      const res = await fetch(`${TARGET_URL}/accounts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${u.token}`,
          'Content-Type': 'application/json',
        },
      });
      
      let accountId = '';
      if (res.status === 201) {
        const data = await res.json();
        accountId = data.id;
      } else if (res.status === 409) {
        const accRes = await fetch(`${TARGET_URL}/accounts`, {
          headers: { 'Authorization': `Bearer ${u.token}` },
        });
        const accs = await accRes.json();
        accountId = accs[0]?.id;
      } else {
        throw new Error(`Falha ao criar conta: ${res.status}`);
      }
      return { ...u, accountId };
    } catch (e) {
      console.error(`Erro ao criar conta de ${u.email}:`, e);
      throw e;
    }
  });
  console.log(`   ✅ Contas bancárias criadas e mapeadas.\n`);

  // --- ETAPA 4: Depósito Inicial e Chave Pix ---
  console.log(`[4/6] Efetuando depósito de R$ 100.00 e vinculando Chave Pix para cada usuário...`);
  const activeSessions = await runInBatches(withAccounts, BATCH_SIZE, async (u) => {
    try {
      // 1. Depósito de R$ 100.00
      const depRes = await fetch(`${TARGET_URL}/accounts/${u.accountId}/deposit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${u.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: '100.00' }),
      });
      if (!depRes.ok) throw new Error(`Falha no depósito para ${u.email}: ${depRes.status}`);

      // 2. Vincula Chave Pix (E-mail do usuário)
      const keyRes = await fetch(`${TARGET_URL}/pix/keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${u.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: u.accountId,
          type: 'EMAIL',
          value: u.email,
        }),
      });

      if (keyRes.status !== 201 && keyRes.status !== 409) {
        throw new Error(`Falha ao registrar chave Pix para ${u.email}: ${keyRes.status}`);
      }

      return {
        email: u.email,
        token: u.token,
        accountId: u.accountId,
        pixKey: u.email,
      };
    } catch (e) {
      console.error(`Erro no setup do usuário ${u.email}:`, e);
      throw e;
    }
  });
  console.log(`   ✅ Setup financeiro concluído.\n`);

  // --- VERIFICAÇÃO DE SALDOS ANTES DO TESTE ---
  console.log(`--- Checagem de Saldos Iniciais ---`);
  let initialTotalBalance = 0;
  for (const session of activeSessions) {
    const res = await fetch(`${TARGET_URL}/accounts/${session.accountId}`, {
      headers: { 'Authorization': `Bearer ${session.token}` },
    });
    const data = await res.json();
    initialTotalBalance += Number(data.balance);
  }
  console.log(`💰 Saldo Total Inicial no Ecossistema: R$ ${initialTotalBalance.toFixed(2)}`);
  console.log(`   (Média esperada por usuário: R$ ${(initialTotalBalance / NUM_USERS).toFixed(2)})\n`);

  // --- ETAPA 5: Disparo de Pix Concorrente ---
  console.log(`[5/6] DISPARANDO ${NUM_USERS} TRANSFERÊNCIAS PIX SIMULTÂNEAS...`);
  console.log(`   (Cada usuário transferirá R$ ${TRANSFER_AMOUNT} de forma circular: User i -> User i+1)`);

  const startTime = Date.now();

  const results = await runInBatches(activeSessions, 20, async (sender, i) => {
    const recipient = activeSessions[(i + 1) % NUM_USERS];
    const idempotencyKey = randomUUID();
    const requestStart = Date.now();
    
    try {
      const res = await fetch(`${TARGET_URL}/pix/transfers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sender.token}`,
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          senderAccountId: sender.accountId,
          destinationKey: recipient.pixKey,
          amount: TRANSFER_AMOUNT,
          description: `Transferência de carga concorrente ${i + 1}`,
        }),
      });

      const duration = Date.now() - requestStart;
      const responseBody = await res.json();
      const servedBy = res.headers.get('X-Served-By') || 'unknown';

      return {
        index: i + 1,
        success: res.status === 201,
        status: res.status,
        duration,
        servedBy,
        error: res.status !== 201 ? responseBody.message || JSON.stringify(responseBody) : null,
      };
    } catch (e: any) {
      return {
        index: i + 1,
        success: false,
        status: 500,
        duration: Date.now() - requestStart,
        servedBy: 'network-failure',
        error: e.message || String(e),
      };
    }
  });

  const totalDuration = Date.now() - startTime;
  console.log(`   ✅ Todas as transferências concorrentes responderam.\n`);

  // --- PROCESSAMENTO DAS ESTATÍSTICAS ---
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  
  const totalRequestTime = results.reduce((acc, r) => acc + r.duration, 0);
  const avgDuration = totalRequestTime / results.length;
  const minDuration = Math.min(...results.map(r => r.duration));
  const maxDuration = Math.max(...results.map(r => r.duration));

  const replicaCounts: Record<string, number> = {};
  results.forEach(r => {
    replicaCounts[r.servedBy] = (replicaCounts[r.servedBy] || 0) + 1;
  });

  // --- ETAPA 6: Re-avaliação do Saldo Final (Conservação de Dinheiro) ---
  console.log(`[6/6] Verificando saldos finais após as transferências concorrentes...`);
  let finalTotalBalance = 0;
  for (const session of activeSessions) {
    try {
      const res = await fetch(`${TARGET_URL}/accounts/${session.accountId}`, {
        headers: { 'Authorization': `Bearer ${session.token}` },
      });
      const data = await res.json();
      if (data && data.balance !== undefined) {
        finalTotalBalance += Number(data.balance);
      } else {
        console.error(`⚠️ Resposta inesperada ao consultar saldo final de ${session.email}:`, JSON.stringify(data));
      }
    } catch (e) {
      console.error(`❌ Erro de rede ao buscar saldo final de ${session.email}:`, e);
    }
  }

  console.log(`\n======================================================`);
  console.log(`📊 RELATÓRIO DO TESTE DE CARGA DE ALTA CONCORRÊNCIA`);
  console.log(`======================================================`);
  console.log(`✔️  Sucessos: ${successCount} / ${NUM_USERS} (${((successCount/NUM_USERS)*100).toFixed(1)}%)`);
  console.log(`❌ Falhas:   ${failureCount} / ${NUM_USERS} (${((failureCount/NUM_USERS)*100).toFixed(1)}%)`);
  console.log(`⏱️  Tempo Total de Execução: ${totalDuration} ms`);
  console.log(`⏱️  Tempo Médio por Request:  ${avgDuration.toFixed(1)} ms`);
  console.log(`⏱️  Request mais Rápida:      ${minDuration} ms`);
  console.log(`⏱️  Request mais Lenta:        ${maxDuration} ms`);
  console.log(`------------------------------------------------------`);
  console.log(`⚖️  CONSERVAÇÃO DE DINHEIRO (INTEGRIDADE FINANCEIRA):`);
  console.log(`💰 Saldo Total Antes: R$ ${initialTotalBalance.toFixed(2)}`);
  console.log(`💰 Saldo Total Depois: R$ ${finalTotalBalance.toFixed(2)}`);
  
  const balanceDifference = Math.abs(initialTotalBalance - finalTotalBalance);
  if (balanceDifference < 0.01) {
    console.log(`💚 RESULTADO: SUCESSO ABSOLUTO! Sem vazamento de dinheiro.`);
  } else {
    console.log(`🚨 RESULTADO: ERRO! Diferença detectada de R$ ${balanceDifference.toFixed(2)}`);
  }
  console.log(`------------------------------------------------------`);
  console.log(`🌐 BALANCEAMENTO DE CARGA (Distribuído por réplica):`);
  Object.entries(replicaCounts).forEach(([replica, count]) => {
    console.log(`   🖥️  ${replica}: ${count} requisições processadas`);
  });
  console.log(`======================================================\n`);

  if (failureCount > 0) {
    console.log(`🔍 Amostra de Falhas Encontradas:`);
    results.filter(r => !r.success).slice(0, 5).forEach(f => {
      console.log(`   - Transferência #${f.index} falhou com status ${f.status} servido por ${f.servedBy}: ${f.error}`);
    });
    console.log(`======================================================\n`);
  }
}

main().catch(console.error);
