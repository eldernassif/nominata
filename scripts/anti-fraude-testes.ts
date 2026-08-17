// scripts/anti-fraude-testes.ts — F0.7, o gate que detecta o comportamento
// degenerado mais comum de agente sob pressão de "faça passar" (plano §9.6,
// tarefas.md F0.7). Seis regras, cada uma vista vermelha na evidência:
//
//   1. marcadores proibidos: .only / .skip / test.todo / xit
//   2. plan(0) e blocos pgTAP comentados
//   3. asserção removida vs base sem MUDANCA-DE-CONTRATO: no corpo do commit
//   4. plan(n) que diminuiu — crescer é normal, diminuir é fraude
//   5. limiar de cobertura reduzido
//   6. supressões de compilador e de linter que aumentaram
//
// Base de comparação (arbitragem do arquiteto 2026-08-15): origin/main
// quando o remoto existir (F0.9), senão HEAD~1. O script IMPRIME a base em
// toda execução — base silenciosa é a forma deste gate dar verde por não ter
// olhado nada. O diff inclui o working tree não commitado: é o que permite
// as demonstrações por regra da evidência.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Violacao {
  regra: string;
  arquivo: string;
  detalhe: string;
}

// -------- funções puras (unit-tested) --------

// Limitação declarada: marcador dentro de string literal passa batido — a
// camada de I/O remove strings antes de conferir (fraude real usa o marcador
// ativo, não texto entre aspas). As funções puras confiam nessa limpeza.
const MARCADOR_PROIBIDO = /\b(?:describe|test|it)\.(only|skip|todo)\(|\bxit\(/g;

export function detectarMarcadores(arquivo: string, conteudo: string): Violacao[] {
  const violacoes: Violacao[] = [];
  conteudo.split('\n').forEach((linha, indice) => {
    const semComentario = linha.replace(/\/\/.*$/, ''); // comentário não é fraude ativa
    for (const ocorrencia of semComentario.matchAll(MARCADOR_PROIBIDO)) {
      violacoes.push({
        regra: 'marcador proibido',
        arquivo,
        detalhe: `${ocorrencia[0]} na linha ${indice + 1}`,
      });
    }
  });
  return violacoes;
}

// linha comentada só conta se tiver FORMA de código pgTAP — `-- select ok(...)`
// é asserção morta, mas prosa comentada que menciona is(...) é comentário
// comum, e o gate não é revisor de texto
const PADRAO_PGTAP_COMENTADO =
  /^\s*--\s*(?:select\s+)?(?:plan|ok|is|isnt|throws_ok|lives_ok|cmp_ok|results_eq)\s*\(/;

export function detectarPgTAPMorto(arquivo: string, conteudo: string): Violacao[] {
  const violacoes: Violacao[] = [];
  conteudo.split('\n').forEach((linha, indice) => {
    const comentada = /^\s*--/.test(linha);
    const ativa = comentada ? '' : linha;
    if (/select\s+plan\(0\)/i.test(ativa)) {
      violacoes.push({
        regra: 'plan(0)',
        arquivo,
        detalhe: `plan(0) ativo na linha ${indice + 1}`,
      });
    } else if (comentada && PADRAO_PGTAP_COMENTADO.test(linha)) {
      violacoes.push({
        regra: 'bloco pgTAP comentado',
        arquivo,
        detalhe: `asserção pgTAP comentada na linha ${indice + 1}: ${linha.trim()}`,
      });
    }
  });
  return violacoes;
}

const ASSERCAO_TS = /\bexpect\(|\bassert\.|\bassert\b/;
const ASSERCAO_PGTAP = /select\s+(ok|is|isnt|throws_ok|lives_ok|cmp_ok|results_eq)\(/;
const LINHA_PLAN = /^([-+])\s*select\s+plan\((\d+)\)/;

export function analisarDiffDeTestes(diff: string, corpoDoCommit: string): Violacao[] {
  const violacoes: Violacao[] = [];
  const planAntes: number[] = [];
  const planDepois: number[] = [];

  for (const linha of diff.split('\n')) {
    if (/^-{3} /.test(linha) || /^\+{3} /.test(linha)) continue; // cabeçalhos --- / +++

    const plan = linha.match(LINHA_PLAN);
    if (plan !== null) {
      const valor = Number(plan[2]);
      if (plan[1] === '-') planAntes.push(valor);
      else planDepois.push(valor);
      continue;
    }

    if (!linha.startsWith('-')) continue;
    const removida = linha.slice(1);
    if (ASSERCAO_TS.test(removida) || ASSERCAO_PGTAP.test(removida)) {
      if (!corpoDoCommit.includes('MUDANCA-DE-CONTRATO:')) {
        violacoes.push({
          regra: 'asserção removida sem MUDANCA-DE-CONTRATO:',
          arquivo: '',
          detalhe: `remoção sem 'MUDANCA-DE-CONTRATO:' no corpo do commit: ${removida.trim()}`,
        });
      }
    }
  }

  for (const antes of planAntes) {
    const menor = planDepois.find((depois) => depois < antes);
    if (planDepois.length === 0) {
      violacoes.push({
        regra: 'plan(n) removido',
        arquivo: '',
        detalhe: `plan(${antes}) removido sem substituto`,
      });
    } else if (menor !== undefined) {
      violacoes.push({
        regra: 'plan(n) diminuiu',
        arquivo: '',
        detalhe: `plan(${antes}) virou plan(${menor})`,
      });
    }
  }

  return violacoes;
}

const BLOCO_THRESHOLDS = /thresholds\s*:\s*\{([\s\S]*?)\}/;
const PAR_THRESHOLD = /(\w+)\s*:\s*(\d+)/g;

export function extrairLimiares(conteudo: string): Record<string, number> {
  const bloco = conteudo.match(BLOCO_THRESHOLDS);
  if (bloco === null || bloco[1] === undefined) return {};
  const resultado: Record<string, number> = {};
  for (const par of bloco[1].matchAll(PAR_THRESHOLD)) {
    if (par[1] !== undefined && par[2] !== undefined) {
      resultado[par[1]] = Number(par[2]);
    }
  }
  return resultado;
}

export function limiarReduzido(
  antes: Record<string, number>,
  depois: Record<string, number>,
): boolean {
  // chave que sumiu é redução a zero: apagar o bloco de limiar é a fraude
  // mais barata de todas
  return Object.entries(antes).some(([chave, valor]) => (depois[chave] ?? 0) < valor);
}

// os padrões são montados por concatenação de propósito: este script varre a
// si mesmo, e o literal do gate não pode conter o padrão que o gate caça —
// senão a contagem sobe a cada edição do próprio gate e a regra se acusa
const PADRAO_SUPRESSAO_COMPILADOR = new RegExp('@ts-' + 'expect-error', 'g');
const PADRAO_SUPRESSAO_LINTER = new RegExp('eslint-' + 'disable', 'g');

export function contarSupressoes(conteudo: string): number {
  const compilador = conteudo.match(PADRAO_SUPRESSAO_COMPILADOR)?.length ?? 0;
  const linter = conteudo.match(PADRAO_SUPRESSAO_LINTER)?.length ?? 0;
  return compilador + linter;
}

export function supressoesAumentaram(antes: number, depois: number): boolean {
  return depois > antes;
}

export function contarSupressoesNormalizadas(conteudo: string): number {
  // normalizar ANTES de contar: menção falsa dentro de string literal não é
  // supressão. Base e estado atual têm que passar pelo MESMO tratamento —
  // contar o "antes" bruto e o "depois" sem strings é a folga da F0.7.1
  return contarSupressoes(removerStringsLiterais(conteudo));
}

// -------- I/O --------

const RAIZ = fileURLToPath(new URL('../', import.meta.url));

// o gate varre o PRÓPRIO arquivo de teste unit, e os exemplos sintéticos de
// fraude vivem em string literals; sem esta limpeza o gate se acusaria para
// sempre. Comentário NÃO é removido — a supressão de linter É comentário, e a
// regra 2 existe para ver comentário. Limitação declarada: regex literal
// contendo aspas pode ser confundido com string; os fontes daqui não têm.
export function removerStringsLiterais(conteudo: string): string {
  let resultado = '';
  let i = 0;
  while (i < conteudo.length) {
    const caractere = conteudo[i]!;
    const proxima = conteudo[i + 1] ?? '';
    if (caractere === '/' && proxima === '/') {
      // comentário de linha copiado integralmente — a supressão de linter vive aqui
      while (i < conteudo.length && conteudo[i] !== '\n') {
        resultado += conteudo[i];
        i += 1;
      }
      continue;
    }
    if (caractere === '/' && proxima === '*') {
      while (i < conteudo.length - 1 && !(conteudo[i] === '*' && conteudo[i + 1] === '/')) {
        resultado += conteudo[i];
        i += 1;
      }
      resultado += '*/';
      i += 2;
      continue;
    }
    if (caractere === '-' && proxima === '-' && (i === 0 || /\s/.test(conteudo[i - 1]!))) {
      // comentário de linha do pgTAP copiado integralmente — a regra 2 caça
      // exatamente isto: `-- select ok(...)` é asserção morta
      while (i < conteudo.length && conteudo[i] !== '\n') {
        resultado += conteudo[i];
        i += 1;
      }
      continue;
    }
    if (caractere === "'" || caractere === '"' || caractere === '`') {
      const delimitador = caractere;
      i += 1;
      while (i < conteudo.length && conteudo[i] !== delimitador) {
        if (conteudo[i] === '\\') i += 1;
        i += 1;
      }
      i += 1; // fecha a string — o conteúdo dela não vai para o resultado
      continue;
    }
    resultado += caractere;
    i += 1;
  }
  return resultado;
}

// varrer o filesystem (não git ls-files) de propósito: as demonstrações por
// regra criam arquivos temporários NÃO commitados, e o gate tem que vê-los
// — um glob que só enxerga o versionado deixa a fraude do working tree passar
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

const ehArquivoDeTesteTS = (nome: string): boolean =>
  /\.(test|spec)\.(ts|tsx)$/.test(nome);

const SUPORTES_RAIZ = ['vitest.config.ts', 'playwright.config.ts'];

function listarArquivosDeTeste(): string[] {
  const ts = varrerArquivos(join(RAIZ, 'testes'), ehArquivoDeTesteTS);
  const e2e = varrerArquivos(join(RAIZ, 'e2e'), ehArquivoDeTesteTS);
  const pgTAP = varrerArquivos(join(RAIZ, 'supabase', 'tests'), (nome) => nome.endsWith('.sql'));
  return [...ts, ...e2e, ...pgTAP];
}

function listarArquivosFonte(): string[] {
  const ts = varrerArquivos(join(RAIZ, 'src'), (nome) => /\.(ts|tsx|js|jsx)$/.test(nome));
  const scripts = varrerArquivos(join(RAIZ, 'scripts'), (nome) => /\.(ts|tsx|js|jsx)$/.test(nome));
  const testes = varrerArquivos(join(RAIZ, 'testes'), (nome) => /\.(ts|tsx|js|jsx)$/.test(nome));
  const e2e = varrerArquivos(join(RAIZ, 'e2e'), (nome) => /\.(ts|tsx|js|jsx)$/.test(nome));
  const soltos = SUPORTES_RAIZ.filter((nome) => existsSync(join(RAIZ, nome)));
  return [...soltos, ...ts, ...scripts, ...testes, ...e2e];
}

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

function determinarBase(): string {
  const remoto = rodar('git remote get-url origin');
  // origin/main quando o remoto existir (F0.9 cria); sem remoto, HEAD~1
  return remoto.exitCode === 0 ? 'origin/main' : 'HEAD~1';
}

function conteudoNaBase(caminho: string, base: string): string {
  const mostrado = rodar(`git show ${base}:${caminho}`);
  return mostrado.exitCode === 0 ? mostrado.saida : '';
}

function main(): void {
  const base = determinarBase();
  console.log(`ANTI-FRAUDE DE TESTES — base de comparação: ${base}`);
  console.log('(diff inclui o working tree não commitado)\n');

  const arquivosDeTeste = listarArquivosDeTeste();
  console.log(`arquivos de teste varridos: ${arquivosDeTeste.length}`);
  const violacoes: Violacao[] = [];

  // regras 1 e 2: estado presente de cada arquivo de teste
  for (const arquivo of arquivosDeTeste) {
    const conteudo = removerStringsLiterais(readFileSync(arquivo, 'utf8'));
    violacoes.push(...detectarMarcadores(arquivo, conteudo));
    violacoes.push(...detectarPgTAPMorto(arquivo, conteudo));
  }

  // regras 3 e 4: o que mudou em relação à base
  const diff = rodar(`git diff ${base} -- testes supabase/tests e2e`);
  const corpoDoCommit = rodar('git log -1 --format=%B').saida;
  violacoes.push(...analisarDiffDeTestes(diff.saida, corpoDoCommit));

  // regra 5: limiar de cobertura (vitest.config.ts) atual vs base
  const configAtual = existsSync(join(RAIZ, 'vitest.config.ts'))
    ? readFileSync(join(RAIZ, 'vitest.config.ts'), 'utf8')
    : '';
  const limiarAntes = extrairLimiares(conteudoNaBase('vitest.config.ts', base));
  const limiarDepois = extrairLimiares(configAtual);
  if (Object.keys(limiarAntes).length === 0) {
    console.log(
      'regra 5 (limiar de cobertura) DORMENTE: sem `thresholds` na base (vitest.config.ts) — ' +
        'base vazia, qualquer valor seria limiar novo, não redução; nada a guardar até a fase configurar cobertura',
    );
  }
  if (limiarReduzido(limiarAntes, limiarDepois)) {
    violacoes.push({
      regra: 'limiar de cobertura reduzido',
      arquivo: 'vitest.config.ts',
      detalhe: `antes ${JSON.stringify(limiarAntes)} → depois ${JSON.stringify(limiarDepois)}`,
    });
  }

  // regra 6: supressões em todos os fontes, atual vs base
  const fontes = listarArquivosFonte();
  let suprimeAntes = 0;
  let suprimeDepois = 0;
  for (const arquivo of fontes) {
    // path.relative, não replace(RAIZ): no Windows os caminhos vêm com
    // backslashes e o replace não casa — todo git show falhava e o "antes"
    // ficava zero para tudo
    const relativo = relative(RAIZ, arquivo).replaceAll('\\', '/');
    suprimeAntes += contarSupressoesNormalizadas(conteudoNaBase(relativo, base));
    suprimeDepois += contarSupressoesNormalizadas(readFileSync(arquivo, 'utf8'));
  }
  if (supressoesAumentaram(suprimeAntes, suprimeDepois)) {
    violacoes.push({
      regra: 'supressões aumentaram',
      arquivo: '',
      detalhe: `contagem de supressões: ${suprimeAntes} → ${suprimeDepois}`,
    });
  }

  console.log('\nVIOLACOES:');
  if (violacoes.length === 0) {
    console.log('  nenhuma');
    console.log('\nRESULTADO: VERDE — as seis regras sem violação contra a base.');
    return;
  }
  for (const violacao of violacoes) {
    const onde = violacao.arquivo === '' ? '' : `${violacao.arquivo}: `;
    console.log(`  [${violacao.regra}] ${onde}${violacao.detalhe}`);
  }
  console.log(`\nRESULTADO: VERMELHO — ${violacoes.length} violação(ões).`);
  process.exit(1);
}

// guarda de entrada: o unit importa as funções puras sem disparar o CLI
const executandoDireto =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executandoDireto) {
  main();
}
