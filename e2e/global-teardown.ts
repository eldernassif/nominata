// F0.8.5 — o teste 1 registra um ping de verdade (app.ping) no fluxo real. A
// guarda da F0.3 (f0_ping_rls_guarda.sql) assume banco limpo e conta o canário:
// qualquer resíduo do e2e quebra a contagem na próxima execução do verify. O
// contrato já faz isso no afterAll; aqui é o mesmo padrão, no fim do e2e — o
// globalSetup trunca no início, este teardown trunca no fim.
//
// Pool PRÓPRIO e não o do support.ts: o Playwright roda globalSetup e
// globalTeardown no mesmo processo, e o setup encerra o pool module-level do
// support — reusá-lo aqui daria "Cannot use a pool after calling end".
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export default async function globalTeardown(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    await pool.query(
      'truncate table app.usuario, app.ping_evento, app.ping, app.conta',
    );
  } finally {
    await pool.end();
  }
}
