// Perna e2e do verify — F0.8.5: e2e com zero testes é FALHA (removidos o
// --pass-with-no-tests e o aviso "SEM CONTEUDO" declarados na F0.4). O
// preview (build + wrangler pages dev na 4173) é subido aqui para o curl -sI
// provar a CSP viva; o Playwright reusa o MESMO servidor (reuseExistingServer
// no playwright.config.ts) — um preview só, um build só.
//
// Aceites estáticos do fecho da fase:
//  1. public/_headers com CSP (connect-src para o Supabase local) e HSTS —
//     o teste 2 do e2e prova a CSP viva; aqui o gate falha cedo, sem subir
//     servidor.
//  2. gate COMPORTAMENTAL do rewrite de SPA (corrigido na F0.8.6): o
//     wrangler pages dev cai em fallback de SPA por padrão quando não existe
//     404.html no build — o texto "/* /index.html 200" em _redirects não
//     prova nada (o Wrangler local rejeita essa regra como "loop infinito" e
//     a ignora). O gate falha se 404.html existir no build; a confirmação
//     por requisição real (rota interna respondendo 200 com o HTML da SPA)
//     já é feita pelo teste 2/3 do e2e.
//  3. curl -sI do preview: content-security-policy + strict-transport-security.
//  4. nenhum valor de segredo real do stack no dist/. Grep por VALOR, não por
//     prefixo: "sb_secret_" aparece como literal interno do supabase-js
//     (falso positivo medido na F0.7.1), o valor completo não pode aparecer.
//  5. preview determinístico (corrigido na F0.8.6): o wrangler pages dev
//     filho pode sobreviver ao taskkill do pai (respawna workerd) e segurar
//     a porta 4173 entre execuções — um preview velho podia validar um build
//     novo. Duas camadas: mata por PORTA (não só por árvore de PID) antes de
//     subir e ao encerrar; e cada build carrega uma MARCA própria injetada em
//     dist/_headers, conferida via resposta HTTP antes de considerar o
//     preview pronto — resposta sem a marca desta execução não conta.
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PREVIEW = 'http://127.0.0.1:4173';
const PORTA_PREVIEW = 4173;
const ESPERA_PREVIEW_MS = 120_000;

// -------- funções puras (unit-tested em testes/unit/verify-e2e.test.ts) --------

export function semArquivo404(nomesNoDist: string[]): boolean {
  // Cloudflare Pages só para de usar o fallback automático de SPA quando
  // existe um 404.html na raiz do build — presença dele é o único jeito real
  // de quebrar o rewrite (o conteúdo de _redirects não é confiável, ver nota
  // do topo do arquivo).
  return !nomesNoDist.includes('404.html');
}

export function linhaDeMarca(marca: string): string {
  return `  X-Preview-Marca: ${marca}`;
}

export function marcaBate(headerRecebido: string | null, marcaEsperada: string): boolean {
  return headerRecebido === marcaEsperada;
}

export function pidsNaPorta(saidaNetstat: string, porta: number): string[] {
  const pids = new Set<string>();
  // formato de `netstat -ano`: Proto  Local Address  Foreign Address  State  PID
  const linhaRegex = /^\s*TCP6?\s+\S+:(\d+)\s+\S+\s+\S+\s+(\d+)\s*$/i;
  for (const linha of saidaNetstat.split(/\r?\n/)) {
    const m = linhaRegex.exec(linha);
    const pid = m?.[2];
    if (m && pid !== undefined && Number(m[1]) === porta && pid !== '0') {
      pids.add(pid);
    }
  }
  return [...pids];
}

// -------- I/O --------

function falhar(perna: string, detalhe: string): never {
  console.error(`verify:e2e FALHOU [${perna}]: ${detalhe}`);
  process.exit(1);
}

function checarHeadersEstatico(): void {
  const headers = readFileSync('public/_headers', 'utf8');
  for (const marca of ['Content-Security-Policy', 'Strict-Transport-Security', 'connect-src', 'http://127.0.0.1:54321']) {
    if (!headers.includes(marca)) falhar('_headers', `public/_headers sem "${marca}"`);
  }
}

function checarAusenciaDe404PosBuild(): void {
  const nomes = readdirSync('dist');
  if (!semArquivo404(nomes)) {
    falhar(
      '404',
      'dist/404.html presente — isso desliga o fallback automático de SPA do Cloudflare Pages e quebra o rewrite em rota interna',
    );
  }
}

function matarProcessosNaPorta(porta: number): void {
  let saida = '';
  try {
    saida = execSync(`netstat -ano | findstr :${porta}`, { encoding: 'utf8' });
  } catch {
    return; // nenhum processo escutando a porta
  }
  for (const pid of pidsNaPorta(saida, porta)) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } catch {
      // já morreu entre o netstat e o taskkill
    }
  }
}

function aplicarMarcaNoDist(marca: string): void {
  const caminho = 'dist/_headers';
  const conteudo = readFileSync(caminho, 'utf8');
  // acrescenta sob o bloco "/*" existente — sem linha em branco antes, senão
  // o parser de _headers interpreta como um novo path sem headers
  writeFileSync(caminho, `${conteudo.trimEnd()}\n${linhaDeMarca(marca)}\n`, 'utf8');
}

function rodarPrincipal(): void {
  checarHeadersEstatico();

  // limpa qualquer preview órfão de uma execução anterior ANTES de construir
  // — sem isso, um wrangler velho pode responder no lugar do novo e o
  // previewPronto() abaixo veria 200 vindo do processo errado
  matarProcessosNaPorta(PORTA_PREVIEW);

  console.log('verify:e2e — build...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch {
    falhar('build', 'npm run build falhou — ver saída acima');
  }

  checarAusenciaDe404PosBuild();

  const marca = randomUUID();
  aplicarMarcaNoDist(marca);

  const preview = spawn('npx wrangler pages dev dist --port 4173', {
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
        if (resposta.ok && marcaBate(resposta.headers.get('x-preview-marca'), marca)) {
          return true;
        }
      } catch {
        // ainda subindo (ECONNREFUSED etc.)
      }
      await new Promise((resolver) => setTimeout(resolver, 1000));
    }
    return false;
  }

  function limparPreview(): void {
    if (!morto) {
      try {
        // /T derruba a árvore inteira (cmd → npm → node → wrangler → workerd);
        // matar só o listener deixava workerd órfão (medido na F0.8.5).
        execSync(`taskkill /PID ${preview.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // já morreu
      }
    }
    // fallback: /T nem sempre alcança o workerd respawnado (medido na F0.8.6)
    matarProcessosNaPorta(PORTA_PREVIEW);
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
      limparPreview();
      falhar('preview', `preview não subiu com a marca desta execução em ${ESPERA_PREVIEW_MS}ms`);
    }

    // --- curl -sI da CSP/HSTS viva ---
    try {
      const curl = execSync(`curl -sI ${PREVIEW}/`, { encoding: 'utf8' }).toLowerCase();
      if (!curl.includes('content-security-policy')) falhar('curl', 'resposta sem Content-Security-Policy');
      if (!curl.includes('strict-transport-security')) falhar('curl', 'resposta sem Strict-Transport-Security');
      if (!curl.includes('connect-src')) falhar('curl', 'CSP sem connect-src');
    } catch (erro) {
      limparPreview();
      falhar('curl', erro instanceof Error ? erro.message : String(erro));
    }

    // --- nenhum segredo real no dist (fresco, pós-build) ---
    const env = execSync('npx supabase status -o env', { encoding: 'utf8' });
    const valores = ['SERVICE_ROLE_KEY', 'SECRET_KEY', 'PUBLISHABLE_KEY']
      .map((chave) => env.match(new RegExp(`^${chave}="([^"]+)"`, 'm'))?.[1])
      .filter((v): v is string => Boolean(v));
    const achados = segredosNoDist(valores);
    if (achados.length > 0) {
      limparPreview();
      falhar('segredo', achados.join('; '));
    }

    // --- playwright real (reusa o preview acima) ---
    const codigo = await new Promise<number>((resolver) => {
      const play = spawn('npx playwright test', { shell: true, stdio: 'inherit' });
      play.on('exit', (c) => resolver(c ?? 1));
    });

    limparPreview();
    if (codigo !== 0) process.exit(codigo);
  }

  principal().catch((erro) => {
    limparPreview();
    falhar('execucao', erro instanceof Error ? erro.message : String(erro));
  });
}

// guarda de entrada: o unit importa as funções puras sem disparar build/preview
const executandoDireto =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executandoDireto) {
  rodarPrincipal();
}
