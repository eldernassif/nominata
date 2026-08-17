// Unit F0.7 — lógica de decisão do scripts/anti-fraude-testes.ts, o gate
// que detecta o comportamento degenerado mais comum de agente sob pressão:
// marcar caso com .skip, zerar plan(0), remover asserção, reduzir plan(n),
// afrouxar limiar de cobertura, aumentar supressões (plano §9.6). As seis
// regras do contrato F0.7, cada uma com caso de violação e caso limpo — a
// regra anti-teatro exige ver cada asserção vermelha mutando aquilo que ela
// cobre, e é aqui que essas mutações rodam. A mecânica de I/O (git diff vs
// a base, varredura dos arquivos) é exercitada pelo próprio script nas
// demonstrações por regra da evidência.
import { describe, expect, test } from 'vitest';
import {
  analisarDiffDeTestes,
  contarSupressoes,
  contarSupressoesNormalizadas,
  detectarMarcadores,
  detectarPgTAPMorto,
  extrairLimiares,
  limiarReduzido,
  supressoesAumentaram,
} from '../../scripts/anti-fraude-testes';

// diff unificado sintético no formato que `git diff -U0` emite — as
// asserções não dependem do git, dependem do formato do diff, que é estável.
const DIFF_COM_REMOCAO_DE_ASSERCAO = [
  'diff --git a/testes/unit/x.test.ts b/testes/unit/x.test.ts',
  '--- a/testes/unit/x.test.ts',
  '+++ b/testes/unit/x.test.ts',
  '@@ -1,4 +1,3 @@',
  ' test(\'x\', () => {',
  '-  expect(x).toBe(1);',
  '   expect(y).toBe(2);',
  ' });',
].join('\n');

const DIFF_COM_PLAN_REDUZIDO = [
  'diff --git a/supabase/tests/f0_estrutural.sql b/supabase/tests/f0_estrutural.sql',
  '--- a/supabase/tests/f0_estrutural.sql',
  '+++ b/supabase/tests/f0_estrutural.sql',
  '@@ -1,2 +1,2 @@',
  '-select plan(8);',
  '+select plan(7);',
].join('\n');

describe('regra 1: marcadores proibidos (.only/.skip/test.todo/xit)', () => {
  test('cada marcador proibido vira violação nomeada', () => {
    const violacoes = detectarMarcadores('x.test.ts', [
      'test.skip(\'pulado\', () => {});',
      'test.only(\'so eu\', () => {});',
      'test.todo(\'um dia\');',
      'xit(\'morto\', () => {});',
      'describe.skip(\'bloco inteiro\', () => {});',
    ].join('\n'));
    const regras = violacoes.map((v) => v.detalhe);
    expect(violacoes.length).toBe(5);
    expect(regras.join('\n')).toContain('.skip');
    expect(regras.join('\n')).toContain('.only');
    expect(regras.join('\n')).toContain('test.todo');
    expect(regras.join('\n')).toContain('xit');
  });

  test('linha comentada com marcador não é fraude ativa', () => {
    expect(detectarMarcadores('x.test.ts', '// test.skip(\'exemplo em comentario\');')).toEqual(
      [],
    );
  });

  test('arquivo limpo não tem violação', () => {
    expect(
      detectarMarcadores('x.test.ts', "test('ok', () => { expect(1).toBe(1); });"),
    ).toEqual([]);
  });
});

describe('regra 2: plan(0) e blocos pgTAP comentados', () => {
  test('plan(0) ativo vira violação', () => {
    const violacoes = detectarPgTAPMorto('x.sql', 'select plan(0);');
    expect(violacoes.length).toBe(1);
    expect(violacoes[0]!.detalhe).toContain('plan(0)');
  });

  test('asserção pgTAP comentada vira violação', () => {
    const violacoes = detectarPgTAPMorto('x.sql', [
      '-- select ok(true, \'isolamento\');',
      '-- select is(current_user, \'authenticated\', \'guarda\');',
    ].join('\n'));
    expect(violacoes.length).toBe(2);
  });

  test('plan(0) comentado também vira violação — o plano manda procurar os dois', () => {
    expect(detectarPgTAPMorto('x.sql', '-- select plan(0);').length).toBe(1);
  });

  test('plan(n) maior que zero e asserção ativa não são violação', () => {
    expect(
      detectarPgTAPMorto('x.sql', "select plan(8);\nselect ok(true, 'vivo');"),
    ).toEqual([]);
  });

  test('comentário comum não é violação', () => {
    expect(detectarPgTAPMorto('x.sql', '-- comentario qualquer sem assertiva')).toEqual([]);
  });
});

describe('regra 3: asserção removida sem MUDANCA-DE-CONTRATO:', () => {
  test('expect removido com commit sem marcador vira violação', () => {
    const violacoes = analisarDiffDeTestes(DIFF_COM_REMOCAO_DE_ASSERCAO, 'implementa tal coisa');
    expect(violacoes.length).toBe(1);
    expect(violacoes[0]!.detalhe).toContain('MUDANCA-DE-CONTRATO');
  });

  test('a mesma remoção com MUDANCA-DE-CONTRATO: no corpo do commit não é fraude', () => {
    expect(
      analisarDiffDeTestes(DIFF_COM_REMOCAO_DE_ASSERCAO, 'MUDANCA-DE-CONTRATO: regra mudou'),
    ).toEqual([]);
  });

  test('asserção pgTAP removida também conta', () => {
    const diff = DIFF_COM_REMOCAO_DE_ASSERCAO.replace('-  expect(x).toBe(1);', '-select is(current_user, \'a\', \'g\');');
    expect(analisarDiffDeTestes(diff, 'commit comum').length).toBe(1);
  });

  test('cabeçalhos --- / +++ e adições puras não são violação', () => {
    const diff = DIFF_COM_REMOCAO_DE_ASSERCAO.replace('-  expect(x).toBe(1);\n', '+  expect(z).toBe(3);\n');
    expect(analisarDiffDeTestes(diff, 'commit comum')).toEqual([]);
  });
});

describe('regra 4: plan(n) que diminuiu', () => {
  test('plan(8) para plan(7) vira violação', () => {
    const violacoes = analisarDiffDeTestes(DIFF_COM_PLAN_REDUZIDO, 'commit comum');
    expect(violacoes.length).toBe(1);
    expect(violacoes[0]!.detalhe).toContain('plan');
  });

  test('plan crescer é normal e não é fraude (precisão do arquiteto, F0.7)', () => {
    const diff = DIFF_COM_PLAN_REDUZIDO.replace('-select plan(8);', '-select plan(7);').replace(
      '+select plan(7);',
      '+select plan(8);',
    );
    expect(analisarDiffDeTestes(diff, 'commit comum')).toEqual([]);
  });

  test('plan removido sem substituto também é violação', () => {
    const diff = DIFF_COM_PLAN_REDUZIDO.replace('+select plan(7);', '');
    expect(analisarDiffDeTestes(diff, 'commit comum').length).toBe(1);
  });
});

describe('regra 5: limiar de cobertura reduzido', () => {
  const CONFIG_COM_LIMIARES = [
    'export default defineConfig({',
    '  test: {',
    '    coverage: {',
    '      thresholds: { lines: 80, branches: 60, statements: 70 },',
    '    },',
    '  },',
    '});',
  ].join('\n');

  test('extrai cada chave do bloco thresholds', () => {
    expect(extrairLimiares(CONFIG_COM_LIMIARES)).toEqual({
      lines: 80,
      branches: 60,
      statements: 70,
    });
  });

  test('sem bloco de coverage não há limiar', () => {
    expect(extrairLimiares('export default defineConfig({});')).toEqual({});
  });

  test('chave que diminuiu é redução', () => {
    expect(limiarReduzido({ lines: 80 }, { lines: 50 })).toBe(true);
  });

  test('chave que cresceu não é redução', () => {
    expect(limiarReduzido({ lines: 80 }, { lines: 90 })).toBe(false);
  });

  test('chave que sumiu é redução a zero', () => {
    expect(limiarReduzido({ lines: 80, branches: 60 }, { lines: 80 })).toBe(true);
  });

  test('limiar novo onde não havia não é redução', () => {
    expect(limiarReduzido({}, { lines: 50 })).toBe(false);
  });
});

describe('regra 6: supressões que aumentaram', () => {
  test('conta @ts-expect-error e eslint-disable', () => {
    expect(
      contarSupressoes(
        "// @ts-expect-error teste\n// eslint-disable-next-line no-explicit-any\nconst a: any = 1;",
      ),
    ).toBe(2);
  });

  test('contagem que subiu é violação; mantida ou reduzida não é', () => {
    expect(supressoesAumentaram(2, 3)).toBe(true);
    expect(supressoesAumentaram(3, 2)).toBe(false);
    expect(supressoesAumentaram(2, 2)).toBe(false);
  });
});

describe('regra 6: supressões normalizadas — os dois lados medem igual (F0.7.1)', () => {
  test('menção falsa dentro de string literal não conta como supressão', () => {
    const conteudo = [
      '// @ts-expect-error legítimo',
      "const a = '@ts-expect-error';",
      'const b = "eslint-disable";',
      'const c = `@ts-expect-error`;',
      "const d = 'eslint-disable-next-line';",
    ].join('\n');
    expect(contarSupressoesNormalizadas(conteudo)).toBe(1);
  });

  test('conteúdo só com menções falsas em string conta zero', () => {
    // as quatro menções falsas a supressões de compilador/linter que vivem
    // dentro de aspas no teste unit do próprio gate — o "antes" bruto contava
    // 4 e o "depois" normalizado 0, a folga que a F0.7.1 fecha
    const conteudo = [
      "const a = '@ts-expect-error';",
      "const b = 'eslint-disable';",
      "const c = '@ts-expect-error';",
      "const d = 'eslint-disable-next-line';",
    ].join('\n');
    expect(contarSupressoesNormalizadas(conteudo)).toBe(0);
  });

  test('supressão real fora de string conta normalmente', () => {
    expect(
      contarSupressoesNormalizadas('const x = 1; // @ts-expect-error intencional'),
    ).toBe(1);
  });

  test('supressão de linter em comentário é preservada — comentário não é string', () => {
    expect(
      contarSupressoesNormalizadas('// eslint-disable-next-line no-explicit-any\nconst a: any = 1;'),
    ).toBe(1);
  });
});
