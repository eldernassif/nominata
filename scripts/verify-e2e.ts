// Perna e2e do verify — F0.8.5: e2e com zero testes é FALHA (removidos o
// --pass-with-no-tests e o aviso "SEM CONTEUDO" declarados na F0.4). O
// preview (build + wrangler pages dev na 4173) é subido aqui para o curl -sI
// provar a CSP viva; o Playwright reusa o MESMO servidor (reuseExistingServer
// no playwright.config.ts) — um preview só, um build só.
//
// Aceites estáticos do fecho da fase:
//  1. public/_redirects com o rewrite do SPA ("/* /index.html 200") — gate
//     ESTRUTURAL. O wrangler pages dev tem SPA fallback embutido, então o
//     "200 em rota interna" do e2e não discrimina o arquivo; a mutação que
//     remove esta linha deixa ESTE gate vermelho (anti-teatro da F0.7.1).
//  2. public/_headers com CSP (connect-src para o Supabase local) e HSTS —
//     o teste 2 do e2e prova a CSP viva; aqui o gate falha cedo, sem subir
//     servidor.
//  3. curl -sI do preview: content-security-policy + strict-transport-security.
//  4. nenhum valor de segredo real do stack no dist/. Grep por VALOR, não por
//     prefixo: "sb_secret_" aparece como literal interno do supabase-js
//     (falso positivo medido na F0.7.1), o valor completo não pode aparecer.
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PREVIEW = 'http://127.0.0.1:4173';
const ESPERA_PREVIEW_MS = 120_000;

function falhar(perna: string, detalhe: string): never {
  console.error(`verify:e2e FALHOU [${perna}]: ${detalhe}`);
  process.exit(1);
}

// --- 1. gate estrutural do deploy config (sem servidor, falha cedo) ---
const headers = readFileSync('public/_headers', 'utf8');
for (const marca of ['Content-Security-Policy', 'Strict-Transport-Security', 'connect-src', 'http://127.0.0.1:54321']) {
  if (!headers.includes(marca)) falhar('_headers', `public/_headers sem "${marca}"`);
}
const redirects = readFileSync('public/_redirects', 'utf8');
if (!redirects.includes('/* /index.html 200')) {
  falhar('_redirects', 'public/_redirects sem o rewrite "/* /index.html 200"');
}

// --- 2. build + preview (o mesmo que o playwright vai reusar) ---
const preview = spawn('npm run build && npx wrangler pages dev dist --port 4173', {
  shell: true,
  stdio: 'inherit',
});
let morto = false;
preview.on('exit', () => {
  morto = true;
});

async function previewPronto(): Promise<boolean> {
  const fim = Date.now() + ESPERA_PREVIEW_MS;
  while (Date.now() < fim && !morto) {
    try {
      const resposta = await fetch(PREVIEW + '/');
      if (resposta.ok) return true;
    } catch {
      // ainda subindo (ECONNREFUSED etc.)
    }
    await new Promise((resolver) => setTimeout(resolver, 1000));
  }
  return false;
}

async function limparPreview(): Promise<void> {
  if (morto) return;
  try {
    // /T derruba a árvore inteira (cmd → npm → node → wrangler → workerd);
    // matar só o listener deixava workerd órfão (medido na F0.8.5).
    execSync(`taskkill /PID ${preview.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    // já morreu
  }
}

function segredosNoDist(valores: string[]): string[] {
  const achados: string[] = [];
  if (!existsSync('dist')) return achados;
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      const info = statSync(caminho);
      if (info.isDirectory()) {
        visitar(caminho);
      } else if (info.size < 10_000_000) {
        const conteudo = readFileSync(caminho, 'utf8');
        for (const valor of valores) {
          if (conteudo.includes(valor)) {
            achados.push(`${caminho} contem ${valor.slice(0, 16)}...`);
          }
        }
      }
    }
  };
  visitar('dist');
  return achados;
}

async function principal(): Promise<void> {
  if (!(await previewPronto())) {
    await limparPreview();
    falhar('preview', `preview não subiu em ${ESPERA_PREVIEW_MS}ms (build ou wrangler)`);
  }

  // --- 3. curl -sI da CSP/HSTS viva ---
  try {
    const curl = execSync(`curl -sI ${PREVIEW}/`, { encoding: 'utf8' }).toLowerCase();
    if (!curl.includes('content-security-policy')) falhar('curl', 'resposta sem Content-Security-Policy');
    if (!curl.includes('strict-transport-security')) falhar('curl', 'resposta sem Strict-Transport-Security');
    if (!curl.includes('connect-src')) falhar('curl', 'CSP sem connect-src');
  } catch (erro) {
    await limparPreview();
    falhar('curl', erro instanceof Error ? erro.message : String(erro));
  }

  // --- 4. nenhum segredo real no dist (fresco, pós-build) ---
  const env = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const valores = ['SERVICE_ROLE_KEY', 'SECRET_KEY', 'PUBLISHABLE_KEY']
    .map((chave) => env.match(new RegExp(`^${chave}="([^"]+)"`, 'm'))?.[1])
    .filter((v): v is string => Boolean(v));
  const achados = segredosNoDist(valores);
  if (achados.length > 0) {
    await limparPreview();
    falhar('segredo', achados.join('; '));
  }

  // --- 5. playwright real (reusa o preview acima) ---
  const codigo = await new Promise<number>((resolver) => {
    const play = spawn('npx playwright test', { shell: true, stdio: 'inherit' });
    play.on('exit', (c) => resolver(c ?? 1));
  });

  await limparPreview();
  if (codigo !== 0) process.exit(codigo);
}

principal().catch(async (erro) => {
  await limparPreview();
  falhar('execucao', erro instanceof Error ? erro.message : String(erro));
});
