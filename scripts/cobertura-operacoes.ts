// scripts/cobertura-operacoes.ts — F0.7, gate da matriz de 6 casos por
// operação (plano §9.4): toda função do schema api é uma operação, e toda
// operação tem que ter os casos canônicos nomeados op:<nome>:<caso> nos
// testes de contrato, pgTAP ou e2e. Condição (a) da F0.5 aplicada aqui:
// catálogo vazio é falha com a lista nomeada impressa — nunca "toda operação
// coberta" sobre operação nenhuma.
//
// Varredura declarada: testes/contrato/**, supabase/tests/*.sql e e2e/** —
// onde as operações são exercitadas de verdade. testes/unit/** está FORA: os
// testes unit dos próprios gates contêm marcadores sintéticos de exemplo, e
// contá-los deixaria o gate verde sem nenhum teste real — a mesma classe de
// cegueira que a condição (a) existe para impedir.
//
// Regra de ausência declarada: um marcador em linha que declare o caso como
// "NAO SE APLICA" não conta como caso — nota de ausência não é cobertura.
// Foi exatamente essa nota que mascarou a ausência real de
// op:registrar_ping:idempotencia no código de 2026-08-15; sem a regra, o
// gate nascia verde por acidente (o defeito da F0.3/F0.4, terceira vez).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

// -------- funções puras (unit-tested) --------

// vocabulário canônico congelado no contrato F0.7 — a colisão com o código
// real (sem_sessao em vez de nao_autenticado) é o que faz o gate nascer
// vermelho de graça
export const VOCABULARIO_CASOS = [
  'valida',
  'invalida',
  'nao_autorizado',
  'nao_autenticado',
  'idempotencia',
  'evento',
] as const;

const PADRAO_CASO = /op:([a-z_][a-z0-9_]*):([a-z_][a-z0-9_]*)/g;

export function validarCatalogoOperacoes(operacoes: string[]): void {
  if (operacoes.length === 0) {
    throw new Error(
      'CATALOGO VAZIO — nenhuma operação no catálogo; conferir cobertura sobre ' +
        'zero operações é dar verde por não ter olhado nada. Liste as funções do ' +
        'schema api ou informe o catálogo.',
    );
  }
}

export function extrairCasos(conteudos: string[]): Set<string> {
  const casos = new Set<string>();
  for (const conteudo of conteudos) {
    for (const linha of conteudo.split('\n')) {
      // nota de ausência não é caso — "NÃO SE APLICA" é a operação FALTANDO
      // o caso, não a documentação dele. A classe [AÃ] é obrigatória: sem
      // ela o Ã acentuado escapa da regex e a nota conta como caso — foi o
      // que a primeira execução real mostrou, idempotencia mascarada.
      if (/N[AÃ]O SE APLICA/i.test(linha)) continue;
      for (const ocorrencia of linha.matchAll(PADRAO_CASO)) {
        if (ocorrencia[1] !== undefined && ocorrencia[2] !== undefined) {
          casos.add(`op:${ocorrencia[1]}:${ocorrencia[2]}`);
        }
      }
    }
  }
  return casos;
}

export function conferirCobertura(operacoes: string[], casos: Set<string>): string[] {
  const faltantes: string[] = [];
  for (const operacao of operacoes) {
    for (const caso of VOCABULARIO_CASOS) {
      const nome = `op:${operacao}:${caso}`;
      if (!casos.has(nome)) faltantes.push(nome);
    }
  }
  return faltantes;
}

// -------- I/O --------

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function varrerArquivos(diretorio: string, filtro: (nome: string) => boolean): string[] {
  if (!existsSync(diretorio)) return [];
  const achados: string[] = [];
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    const caminho = join(diretorio, entrada.name);
    if (entrada.isDirectory()) achados.push(...varrerArquivos(caminho, filtro));
    else if (filtro(entrada.name)) achados.push(caminho);
  }
  return achados;
}

async function catalogarOperacoes(esquema: string): Promise<string[]> {
  const cliente = new Client({ connectionString: DATABASE_URL });
  try {
    await cliente.connect();
    // regnamespace inválido lança — schema inexistente é catálogo vazio,
    // não erro silencioso; o catch abaixo devolve [] e a condição (a) fala
    try {
      const resultado = await cliente.query<{ proname: string }>(
        'select proname from pg_proc where pronamespace = $1::regnamespace order by proname',
        [esquema],
      );
      return resultado.rows.map((linha) => linha.proname);
    } catch {
      return [];
    }
  } finally {
    await cliente.end().catch(() => {});
  }
}

async function main(): Promise<void> {
  const indiceSchema = process.argv.indexOf('--schema');
  const esquema =
    indiceSchema !== -1 && process.argv[indiceSchema + 1] !== undefined
      ? process.argv[indiceSchema + 1]!
      : 'api';

  console.log(`COBERTURA-OPERACOES — matriz de 6 casos por operação (plano §9.4)`);
  console.log(`schema: ${esquema}\n`);

  const operacoes = await catalogarOperacoes(esquema);

  try {
    validarCatalogoOperacoes(operacoes);
  } catch (erro) {
    console.log(`[FALHOU] catálogo de operações`);
    console.log(`  ${String((erro as Error).message)}`);
    console.log('\nRESULTADO: VERMELHO — catálogo vazio.');
    process.exit(1);
  }

  console.log(`operações catalogadas: ${operacoes.length} — ${operacoes.join(', ')}`);

  const arquivos = [
    ...varrerArquivos(join(RAIZ, 'testes', 'contrato'), (nome) => nome.endsWith('.ts')),
    ...varrerArquivos(join(RAIZ, 'supabase', 'tests'), (nome) => nome.endsWith('.sql')),
    ...varrerArquivos(join(RAIZ, 'e2e'), (nome) => nome.endsWith('.ts')),
  ];
  const conteudos = arquivos.map((arquivo) => readFileSync(arquivo, 'utf8'));
  console.log(`arquivos varridos: ${arquivos.length}`);

  const casos = extrairCasos(conteudos);
  const faltantes = conferirCobertura(operacoes, casos);

  if (faltantes.length > 0) {
    console.log('\nCASOS FALTANTES:');
    for (const nome of faltantes) console.log(`  ${nome}`);
    console.log(`\nRESULTADO: VERMELHO — ${faltantes.length} caso(s) faltando.`);
    process.exit(1);
  }
  console.log('\nRESULTADO: VERDE — toda operação com os 6 casos canônicos.');
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
