// Provisiona o usuário do e2e antes da suíte. Mesmo padrão do contrato
// (testes/contrato/support.ts): conexão direta via pg para app.conta/app.usuario
// e Admin API (createUser/deleteUser) para auth.users — o magic link só loga um
// usuário que já existe; e sem a linha em app.usuario o hook de access token não
// popula conta_id e registrar_ping devolve 42501. Reusa truncarCanario() como
// higiene entre suítes. Rodado pelo Playwright (globalSetup) antes de qualquer
// teste; o servidor de preview já subiu (webServer).
import { execSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';

import {
  criarConta,
  criarUsuario,
  pool,
  truncarCanario,
} from '../testes/contrato/support';

export const EMAIL_E2E = 'e2e@nominata.dev';
const NOME_CONTA_E2E = 'conta e2e';

function segredosLocais(): { url: string; serviceRole: string } {
  const doEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (doEnv) {
    return {
      url: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
      serviceRole: doEnv,
    };
  }
  const saida = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const url = saida.match(/^API_URL="([^"]+)"/m)?.[1];
  const serviceRole = saida.match(/^SERVICE_ROLE_KEY="([^"]+)"/m)?.[1];
  if (!url || !serviceRole) {
    throw new Error('supabase status -o env sem API_URL/SERVICE_ROLE_KEY');
  }
  return { url, serviceRole };
}

export default async function globalSetup(): Promise<void> {
  const { url, serviceRole } = segredosLocais();
  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // o auth user de uma execução anterior fica em auth.users (o truncar não
  // alcança o schema auth) — sem deletar, o createUser devolve "already
  // registered". Ciclo de vida inteiro via Admin API (path suportado; o schema
  // auth não é do papel postgres local).
  const { data: lista } = await admin.auth.admin.listUsers();
  const antigo = lista.users.find((u) => u.email === EMAIL_E2E);
  if (antigo) {
    await admin.auth.admin.deleteUser(antigo.id);
  }

  await truncarCanario();

  const conta = await criarConta(NOME_CONTA_E2E);
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL_E2E,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const authUserId = data.user?.id;
  if (!authUserId) throw new Error('createUser nao retornou user.id');

  await criarUsuario(authUserId, conta.id);
  await pool.end();
}
