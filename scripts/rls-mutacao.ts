// scripts/rls-mutacao.ts — F0.5, o teste do teste (tarefas.md F0.5).
//
// Para cada policy do catálogo em pg_policies: drop, roda a suíte
// (`supabase test db`), classifica o veredito, restaura por `db reset` e
// CONFERE a restauração antes da próxima volta. Exit 0 só se toda policy,
// ao ser removida, quebrar pelo menos um teste.
//
// As três formas de este script dar verde falso (emenda do arquiteto,
// 2026-08-14) vivem em funções unit-testadas:
//   (a) catálogo vazio é falha            → validarCatalogo
//   (b) linha de base vermelha aborta     → validarLinhaBase
//   (c) vermelho por infraestrutura       → classificarVeredito
// mais a restauração conferida a cada volta → conferirRestauracao.
//
// Achado do arquiteto na demonstração da F0.5, corrigido na F0.6: o catálogo
// era lido ANTES do reset da linha de base — auditava o estado em que o
// banco por acaso estava, não o que as migrations definem. A leitura agora
// vem DEPOIS do reset: o catálogo vira a verdade das migrations.
//
// Usa pg (Node), não psql — não exige cliente Postgres instalado.
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pg from 'pg';

export interface PolicyItem {
  schema: string;
  tabela: string;
  policy: string;
}

export interface ResultadoRodada {
  exitCode: number | null;
  saida: string;
}

export type Veredito = 'quebrou' | 'nao-quebrou' | 'inconclusivo';

// schemas do projeto — nunca os da plataforma (storage, realtime,
// supabase_functions...), que a imagem do Supabase instala e que não são
// nossos para auditar desta forma.
const SCHEMAS_DO_PROJETO = ['public', 'app', 'api', 'private'];

// resultado de teste reconhecível na saída do supabase test db (formatos
// reais vistos na F0.4): sem um destes, exit≠0 é infraestrutura (banco
// caído, reset falhado, conexão morta) e a policy NÃO conta como coberta.
const MARCADOR_RESULTADO_TESTE =
  /#\s*Failed test\s+\d+|Failed\s+\d+\/\d+\s+subtests|\bnot ok\b|Bad plan/i;

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export function listaNomeada(itens: PolicyItem[]): string {
  return itens
    .map((item) => `  ${item.schema}.${item.tabela}.${item.policy}`)
    .join('\n');
}

export function validarCatalogo(itens: PolicyItem[]): void {
  if (itens.length === 0) {
    throw new Error(
      'CATALOGO VAZIO: nenhuma policy em pg_policies nos schemas ' +
        'public/app/api/private. Filtro de schema errado ou tabela renomeada. ' +
        'Falha de proposito: sem catalogo o loop nao roda e "toda policy ' +
        'coberta" sobre policy nenhuma e verde falso.',
    );
  }
}

export function validarLinhaBase(resultado: ResultadoRodada): void {
  if (resultado.exitCode !== 0) {
    throw new Error(
      'LINHA DE BASE VERMELHA: db reset + supabase test db falhou ANTES de ' +
        'qualquer drop. Todo drop "quebraria" uma suite ja quebrada — nada a ' +
        'provar. Abortando.',
    );
  }
}

export function classificarVeredito(resultado: ResultadoRodada): Veredito {
  if (resultado.exitCode === 0) return 'nao-quebrou';
  return MARCADOR_RESULTADO_TESTE.test(resultado.saida) ? 'quebrou' : 'inconclusivo';
}

// nunca iterar por nome: tenant_lock existe em app.ping E em app.ping_evento
export function chaveDeIteracao(item: PolicyItem): string {
  return `${item.schema}.${item.tabela}.${item.policy}`;
}

export function conferirRestauracao(antes: PolicyItem[], depois: PolicyItem[]): void {
  const chavesAntes = new Set(antes.map(chaveDeIteracao));
  const chavesDepois = new Set(depois.map(chaveDeIteracao));
  const iguais =
    chavesAntes.size === chavesDepois.size &&
    [...chavesAntes].every((chave) => chavesDepois.has(chave));
  if (!iguais) {
    throw new Error(
      'RESTAURACAO FALHOU: o catalogo apos db reset difere da linha de base. ' +
        'Um reset que falha em silencio envenena o resto do loop — abortando.',
    );
  }
}

export function filtrarPorTabela(itens: PolicyItem[], tabela: string): PolicyItem[] {
  return itens.filter((item) => item.tabela === tabela);
}

function rodar(comando: string): ResultadoRodada {
  try {
    const saida = execSync(comando, {
      cwd: RAIZ,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, saida };
  } catch (erro) {
    const falha = erro as {
      status?: number | null;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      exitCode: typeof falha.status === 'number' ? falha.status : 1,
      saida: [falha.stdout, falha.stderr, falha.message].filter(Boolean).join('\n'),
    };
  }
}

// conexão nova por consulta de propósito: o db reset recria o banco e mata
// toda conexão existente — reutilizar um pool entre resets é erro na certa.
async function consultar<T extends pg.QueryResultRow>(
  sql: string,
  parametros?: unknown[],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const resultado = await client.query<T>(sql, parametros);
    return resultado.rows;
  } finally {
    await client.end();
  }
}

async function lerCatalogo(): Promise<PolicyItem[]> {
  return consultar<PolicyItem>(
    `select schemaname as schema, tablename as tabela, policyname as policy
       from pg_policies
      where schemaname = any ($1::text[])
      order by schemaname, tablename, policyname`,
    [SCHEMAS_DO_PROJETO],
  );
}

async function droparPolicy(item: PolicyItem): Promise<void> {
  // sem "if exists" de propósito: drop que não acontece tem que ser barulhento,
  // senão a rodada seguinte roda com a policy ainda no lugar e o veredito mente
  const nome = item.policy.replace(/"/g, '""');
  await consultar(`drop policy "${nome}" on ${item.schema}.${item.tabela}`);
}

function linhasDeFalha(saida: string): string[] {
  const linhas = saida.match(
    /^.*(?:#\s*Failed test\s+\d+|Failed\s+\d+\/\d+\s+subtests|not ok|Bad plan).*$/gim,
  );
  return linhas === null ? [] : linhas.slice(0, 5);
}

function lerFlagApenas(argv: string[]): string | undefined {
  const indice = argv.indexOf('--apenas');
  if (indice === -1) return undefined;
  const valor = argv[indice + 1];
  if (valor === undefined || valor.startsWith('--')) {
    throw new Error('USO: --apenas <tabela> — o valor é obrigatório');
  }
  return valor;
}

async function main(): Promise<void> {
  const apenasTabela = lerFlagApenas(process.argv);

  // (b) linha de base PRIMEIRO: db reset + suíte verde ANTES de qualquer
  // drop. A leitura do catálogo vem depois de propósito (achado F0.5): com
  // banco sujo, o script abortava no primeiro conferirRestauracao — auditar
  // o estado canônico exige o reset antes da leitura.
  console.log('\nLINHA DE BASE: db reset + supabase test db...');
  const resetInicial = rodar('npx supabase db reset --yes --local');
  if (resetInicial.exitCode !== 0) {
    throw new Error(`LINHA DE BASE VERMELHA: db reset falhou.\n${resetInicial.saida}`);
  }
  const linhaDeBase = rodar('npx supabase test db');
  validarLinhaBase(linhaDeBase);
  console.log('LINHA DE BASE VERDE.');

  // (a) catálogo — lido DEPOIS do reset (ver acima) e impresso NOMEADO
  // antes de qualquer validação
  const catalogoCompleto = await lerCatalogo();
  const alvos = apenasTabela === undefined
    ? catalogoCompleto
    : filtrarPorTabela(catalogoCompleto, apenasTabela);
  console.log(`CATALOGO DE POLICIES (${alvos.length}):`);
  console.log(listaNomeada(alvos));
  validarCatalogo(alvos);

  // loop: drop -> suíte -> veredito -> reset -> CONFERIR restauração
  const vereditos: Array<{ item: PolicyItem; veredito: Veredito; detalhe: string }> = [];
  for (const item of alvos) {
    const chave = chaveDeIteracao(item);
    console.log(`\n=== ${chave} ===`);
    await droparPolicy(item);
    const rodada = rodar('npx supabase test db');
    const veredito = classificarVeredito(rodada);
    const detalhe = linhasDeFalha(rodada.saida).join('\n    ');

    const reset = rodar('npx supabase db reset --yes --local');
    if (reset.exitCode !== 0) {
      throw new Error(`RESTAURACAO FALHOU: db reset saiu com erro.\n${reset.saida}`);
    }
    const catalogoDepois = await lerCatalogo();
    conferirRestauracao(catalogoCompleto, catalogoDepois);

    vereditos.push({ item, veredito, detalhe });
    console.log(`VEREDITO: ${veredito.toUpperCase()} ${chave}`);
    if (detalhe !== '') console.log(`    ${detalhe}`);
  }

  // relatório: uma linha por policy, veredito de cada uma
  console.log('\nVEREDITO POR POLICY:');
  let tudoCoberto = true;
  for (const { item, veredito, detalhe } of vereditos) {
    const chave = chaveDeIteracao(item);
    if (veredito === 'quebrou') {
      console.log(`  QUEBROU ....... ${chave} — coberta por execucao`);
    } else if (veredito === 'nao-quebrou') {
      tudoCoberto = false;
      console.log(`  NAO QUEBROU ... ${chave} — POLITICA SEM COBERTURA`);
    } else {
      tudoCoberto = false;
      console.log(`  INCONCLUSIVO .. ${chave} — nunca conta como coberto`);
      if (detalhe !== '') console.log(`    ${detalhe}`);
    }
  }

  if (!tudoCoberto) {
    console.log('\nRESULTADO: VERMELHO — existe policy sem cobertura comprovada.');
    process.exit(1);
  }
  console.log(
    '\nRESULTADO: VERDE — toda policy, ao ser removida, quebrou pelo menos um teste.',
  );
}

// guarda de entrada: o unit importa as funções puras sem disparar o CLI
const executandoDireto =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executandoDireto) {
  main().catch((erro: unknown) => {
    console.error(String(erro));
    process.exit(1);
  });
}
