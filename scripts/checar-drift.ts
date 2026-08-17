// scripts/checar-drift.ts — F0.7, detector do modo de falha mais provável de
// um projeto com MCP conectado (plano §9.6): o schema ou os tipos derivarem
// da fonte de verdade. Três checagens, cada uma vista vermelha na evidência:
//
//   (a) banco e migrations divergentes — `supabase db diff --local` tem que
//       imprimir diff vazio;
//   (b) tipos versionados divergentes do `gen types` — regenerar e comparar,
//       ignorando fim de linha;
//   (c) migration já aplicada é imutável — sha256 por arquivo contra um
//       manifesto versionado.
//
// Decisão de fim de linha (declarada — a armadilha do contrato F0.7): o
// checkout do Windows entrega src/types/database.ts em CRLF e o CLI emite LF.
// Duas camadas: .gitattributes fixa o arquivo em LF, e as comparações de
// conteúdo (b e c) normalizam EOL antes — o hash do manifesto é do conteúdo
// normalizado, não dos bytes do checkout. Um clone em qualquer sistema
// produz o mesmo resultado.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// -------- funções puras (unit-tested) --------

export function interpretarDbDiff(saida: string): boolean {
  return saida.trim() === '';
}

export function normalizarEol(texto: string): string {
  return texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function compararTipos(gerado: string, versionado: string): boolean {
  return normalizarEol(gerado) === normalizarEol(versionado);
}

export function calcularHash(conteudo: string): string {
  // hash do conteúdo NORMALIZADO: CRLF de checkout não é mudança de migration
  return createHash('sha256').update(normalizarEol(conteudo)).digest('hex');
}

export function conferirManifesto(
  arquivos: { nome: string; hash: string }[],
  manifesto: Record<string, string>,
): string[] {
  // semântica de conjunto exato: arquivo sem entrada, entrada sem arquivo e
  // hash divergente são todos violações — o gate não fica cego em direção
  // nenhuma
  const violacoes: string[] = [];
  const nomes = new Set(arquivos.map((arquivo) => arquivo.nome));
  for (const arquivo of arquivos) {
    const esperado = manifesto[arquivo.nome];
    if (esperado === undefined) {
      violacoes.push(`${arquivo.nome} — migration sem entrada no manifesto`);
    } else if (esperado !== arquivo.hash) {
      violacoes.push(`${arquivo.nome} — migration aplicada alterada`);
    }
  }
  for (const nome of Object.keys(manifesto)) {
    if (!nomes.has(nome)) {
      violacoes.push(`${nome} — entrada no manifesto sem arquivo no diretório`);
    }
  }
  return violacoes;
}

// -------- I/O --------

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const ARQUIVO_DE_TIPOS = join(RAIZ, 'src', 'types', 'database.ts');
const DIRETORIO_MIGRATIONS = join(RAIZ, 'supabase', 'migrations');
// fora do diretório de migrations de propósito: o CLI avisa a cada run sobre
// arquivo que não casa com o padrão <timestamp>_nome.sql dentro dele
const ARQUIVO_MANIFESTO = join(RAIZ, 'supabase', 'migrations-manifest.json');

function rodar(comando: string): { exitCode: number | null; saida: string } {
  try {
    const saida = execSync(comando, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { exitCode: 0, saida };
  } catch (erro) {
    const falha = erro as { status?: number | null; stdout?: string; stderr?: string };
    return {
      exitCode: typeof falha.status === 'number' ? falha.status : 1,
      saida: [falha.stdout, falha.stderr].filter(Boolean).join('\n'),
    };
  }
}

function extrairDiffDoJson(saida: string): string {
  // o CLI moderno emite um envelope JSON com o campo diff; o antigo emite o
  // diff cru. O JSON é o contrato com o campo diff — sem parsear, um diff
  // vazio viria com o envelope e pareceria drift.
  try {
    const json = JSON.parse(saida) as { diff?: unknown };
    if (typeof json.diff === 'string') return json.diff;
  } catch {
    // não é JSON — é o diff cru de um CLI mais velho
  }
  return saida;
}

function checarDiffDeBanco(): { ok: boolean; detalhe: string } {
  const resultado = rodar('npx supabase db diff --local');
  if (resultado.exitCode !== 0) {
    return {
      ok: false,
      detalhe: `db diff falhou com exit ${resultado.exitCode}: ${resultado.saida.slice(0, 300)}`,
    };
  }
  const diff = extrairDiffDoJson(resultado.saida);
  if (!interpretarDbDiff(diff)) {
    return { ok: false, detalhe: `drift de schema:\n${diff.slice(0, 600)}` };
  }
  return { ok: true, detalhe: 'banco alinhado às migrations' };
}

function checarTipos(): { ok: boolean; detalhe: string } {
  const resultado = rodar('npx supabase gen types typescript --local');
  if (resultado.exitCode !== 0) {
    return {
      ok: false,
      detalhe: `gen types falhou com exit ${resultado.exitCode}: ${resultado.saida.slice(0, 300)}`,
    };
  }
  const versionado = readFileSync(ARQUIVO_DE_TIPOS, 'utf8');
  if (!compararTipos(resultado.saida, versionado)) {
    return { ok: false, detalhe: 'src/types/database.ts diverge do gen types' };
  }
  return { ok: true, detalhe: 'tipos versionados batem com o gen types' };
}

function checarManifesto(): { ok: boolean; detalhe: string } {
  if (!existsSync(ARQUIVO_MANIFESTO)) {
    return {
      ok: false,
      detalhe: `manifesto ausente em ${ARQUIVO_MANIFESTO} — gere com --gerar`,
    };
  }
  const manifesto = JSON.parse(readFileSync(ARQUIVO_MANIFESTO, 'utf8')) as Record<string, string>;
  const arquivos = readdirSync(DIRETORIO_MIGRATIONS)
    .filter((nome) => nome.endsWith('.sql'))
    .sort()
    .map((nome) => ({
      nome,
      hash: calcularHash(readFileSync(join(DIRETORIO_MIGRATIONS, nome), 'utf8')),
    }));
  const violacoes = conferirManifesto(arquivos, manifesto);
  if (violacoes.length > 0) {
    return { ok: false, detalhe: violacoes.join('\n') };
  }
  return { ok: true, detalhe: `manifesto cobre as ${arquivos.length} migrations` };
}

function gerarManifesto(): void {
  const arquivos = readdirSync(DIRETORIO_MIGRATIONS)
    .filter((nome) => nome.endsWith('.sql'))
    .sort();
  const manifesto: Record<string, string> = {};
  for (const nome of arquivos) {
    manifesto[nome] = calcularHash(readFileSync(join(DIRETORIO_MIGRATIONS, nome), 'utf8'));
  }
  writeFileSync(ARQUIVO_MANIFESTO, `${JSON.stringify(manifesto, null, 2)}\n`, 'utf8');
  console.log(`manifesto gerado em ${ARQUIVO_MANIFESTO} — ${arquivos.length} migrations`);
}

function main(): void {
  if (process.argv.includes('--gerar')) {
    gerarManifesto();
    return;
  }

  console.log('CHECAR-DRIFT — as três checagens do plano §9.6');
  console.log('decisão de EOL: tipos fixados em LF via .gitattributes; hash e comparação normalizam EOL\n');

  const checagens: { nome: string; resultado: { ok: boolean; detalhe: string } }[] = [
    { nome: '(a) db diff --local', resultado: checarDiffDeBanco() },
    { nome: '(b) gen types vs versionado', resultado: checarTipos() },
    { nome: '(c) manifesto de migrations', resultado: checarManifesto() },
  ];

  let falhas = 0;
  for (const checagem of checagens) {
    const estado = checagem.resultado.ok ? 'OK' : 'FALHOU';
    console.log(`[${estado}] ${checagem.nome}`);
    if (!checagem.resultado.ok) {
      falhas += 1;
      console.log(`  ${checagem.resultado.detalhe}`);
    }
  }

  if (falhas > 0) {
    console.log(`\nRESULTADO: VERMELHO — ${falhas} checagem(ns) falhou.`);
    process.exit(1);
  }
  console.log('\nRESULTADO: VERDE — schema, tipos e migrations sem drift.');
}

// guarda de entrada: o unit importa as funções puras sem disparar o CLI
const executandoDireto =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executandoDireto) {
  main();
}
