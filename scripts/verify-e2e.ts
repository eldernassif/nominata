// Perna e2e do verify — F0.4 a F0.7: não há app (a F0.8 cria a SPA), então
// esta perna ainda não PODE ter conteúdo. Arbitragem 2026-08-14: o
// --pass-with-no-tests sozinho é recusado por ser silencioso — um glob
// quebrado depois da F0.8 deixaria a perna verde sem ninguém ver. Por isso
// a perna GRITA a ausência, de forma visível em todo arquivo de evidência.
// F0.8 (item de aceite no tarefas.md): remover o --pass-with-no-tests e
// este aviso — a partir de lá, e2e com zero testes é falha.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const arquivos = existsSync('e2e') ? readdirSync('e2e') : [];
const testes = arquivos.filter((f) => /\.(spec|test)\.ts$/.test(f));

if (testes.length === 0) {
  console.log(
    'AVISO verify:e2e: SEM CONTEUDO — nenhum teste e2e existe; ' +
      'a F0.8 (SPA mínima) preenche esta perna. ' +
      '--pass-with-no-tests vigente até lá (aceite F0.8: remover).',
  );
}

try {
  execSync('npx playwright test --pass-with-no-tests', { stdio: 'inherit' });
} catch (erro) {
  const status = (erro as { status?: number }).status;
  process.exit(typeof status === 'number' ? status : 1);
}
