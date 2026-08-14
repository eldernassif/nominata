// Unit F0.5 — lógica de decisão do scripts/rls-mutacao.ts, o "teste do
// teste". O script é o gate dos outros gates: se der verde por motivo
// errado, nenhuma verificação posterior pega (tarefas.md F0.5, emenda do
// arquiteto 2026-08-14). Por isso estas asserções cobrem as TRÊS formas de
// verde falso — (a) catálogo vazio, (b) linha de base vermelha, (c) vermelho
// por infraestrutura — mais a restauração conferida a cada volta. A mecânica
// de I/O (drop, reset, supabase test db) é exercitada pelo próprio script no
// critério de aceite: `npm run verify:rls-mutacao` contra o banco local.
import { describe, expect, test } from 'vitest';
import {
  chaveDeIteracao,
  classificarVeredito,
  conferirRestauracao,
  filtrarPorTabela,
  listaNomeada,
  validarCatalogo,
  validarLinhaBase,
  type PolicyItem,
  type ResultadoRodada,
} from '../../scripts/rls-mutacao';

// catálogo real conferido pelo arquiteto em 2026-08-14: seis policies em
// duas tabelas. Sem contagem chumbada no script — esta lista existe aqui só
// para as asserções, não é entrada dele.
const CATALOGO_REAL: PolicyItem[] = [
  { schema: 'app', tabela: 'ping', policy: 'tenant_lock' },
  { schema: 'app', tabela: 'ping', policy: 'ping_select' },
  { schema: 'app', tabela: 'ping', policy: 'ping_insert' },
  { schema: 'app', tabela: 'ping_evento', policy: 'tenant_lock' },
  { schema: 'app', tabela: 'ping_evento', policy: 'ping_evento_select' },
  { schema: 'app', tabela: 'ping_evento', policy: 'ping_evento_insert' },
];

describe('condição (a): catálogo', () => {
  test('catálogo vazio é falha — nunca "toda policy coberta" sobre policy nenhuma', () => {
    expect(() => validarCatalogo([])).toThrow(/CATALOGO VAZIO/);
  });

  test('catálogo com as seis policies não falha', () => {
    expect(() => validarCatalogo(CATALOGO_REAL)).not.toThrow();
  });

  test('lista nomeada imprime schema.tabela.policy — as duas tenant_lock aparecem distintas', () => {
    // armadilha do tarefas.md: iterar por (schema, tabela, policy), nunca por
    // nome — tenant_lock existe em app.ping E em app.ping_evento. Se a lista
    // colapsar as duas, o loop pula uma ou dropa a errada.
    const lista = listaNomeada(CATALOGO_REAL);
    expect(lista).toContain('app.ping.tenant_lock');
    expect(lista).toContain('app.ping_evento.tenant_lock');
  });

  test('chave de iteração distingue as duas tenant_lock por tabela', () => {
    const chaves = new Set(CATALOGO_REAL.map(chaveDeIteracao));
    expect(chaves.size).toBe(CATALOGO_REAL.length);
    expect(chaveDeIteracao(CATALOGO_REAL[0]!)).not.toBe(
      chaveDeIteracao(CATALOGO_REAL[3]!),
    );
  });

  test('--apenas <tabela> filtra o loop; tabela sem policy é catálogo vazio e falha', () => {
    const filtrado = filtrarPorTabela(CATALOGO_REAL, 'ping');
    expect(filtrado).toHaveLength(3);
    expect(filtrado.every((item) => item.tabela === 'ping')).toBe(true);
    expect(() => validarCatalogo(filtrarPorTabela(CATALOGO_REAL, 'tabela_inexistente'))).toThrow(
      /CATALOGO VAZIO/,
    );
  });
});

describe('condição (b): linha de base', () => {
  test('linha de base verde (exit 0) passa', () => {
    expect(() =>
      validarLinhaBase({ exitCode: 0, saida: 'All tests successful. Result: PASS' }),
    ).not.toThrow();
  });

  test('linha de base vermelha aborta — todo drop "quebraria" uma suíte já quebrada', () => {
    expect(() =>
      validarLinhaBase({ exitCode: 1, saida: 'Failed 1/9 subtests' }),
    ).toThrow(/LINHA DE BASE VERMELHA/);
  });
});

describe('condição (c): veredito de uma rodada', () => {
  const resultado = (exitCode: number | null, saida: string): ResultadoRodada => ({
    exitCode,
    saida,
  });

  test('exit 0 sem a policy é NÃO QUEBROU — política sem cobertura', () => {
    expect(
      classificarVeredito(resultado(0, 'All tests successful. Result: PASS')),
    ).toBe('nao-quebrou');
  });

  test('exit ≠ 0 com "# Failed test N" é QUEBROU — vermelho por asserção', () => {
    expect(
      classificarVeredito(
        resultado(1, '# Failed test 5: "app_owner nao grava ping com conta_id alheio"'),
      ),
    ).toBe('quebrou');
  });

  test('exit ≠ 0 com "Failed N/M subtests" é QUEBROU', () => {
    expect(classificarVeredito(resultado(1, 'Failed 1/9 subtests — Result: FAIL'))).toBe(
      'quebrou',
    );
  });

  test('exit ≠ 0 com plano TAP ("not ok" / "Bad plan") é QUEBROU', () => {
    expect(classificarVeredito(resultado(1, 'not ok 2 - conta A nao enxerga o ping da conta B'))).toBe(
      'quebrou',
    );
    expect(
      classificarVeredito(resultado(1, 'Bad plan. You planned 8 tests but ran 4')),
    ).toBe('quebrou');
  });

  test('exit ≠ 0 SEM resultado de teste reconhecível é INCONCLUSIVO — nunca conta como coberto', () => {
    // infraestrutura: banco caído, reset falhado, conexão morta — o exit code
    // sozinho não distingue asserção vermelha de desastre
    expect(
      classificarVeredito(resultado(1, 'Error: connect ECONNREFUSED 127.0.0.1:54322')),
    ).toBe('inconclusivo');
  });
});

describe('restauração conferida a cada volta', () => {
  test('catálogo idêntico após o reset passa', () => {
    expect(() => conferirRestauracao(CATALOGO_REAL, [...CATALOGO_REAL])).not.toThrow();
  });

  test('policy ausente após o reset falha — um reset em silêncio envenena o resto do loop', () => {
    const depois = CATALOGO_REAL.filter((item) => item.policy !== 'ping_select');
    expect(() => conferirRestauracao(CATALOGO_REAL, depois)).toThrow(/RESTAURACAO FALHOU/);
  });

  test('mesma contagem com policy trocada falha — tamanho sozinho não confere restauração', () => {
    const depois = CATALOGO_REAL.map((item) =>
      item.policy === 'ping_select' ? { ...item, policy: 'outra_policy' } : item,
    );
    expect(() => conferirRestauracao(CATALOGO_REAL, depois)).toThrow(/RESTAURACAO FALHOU/);
  });
});
