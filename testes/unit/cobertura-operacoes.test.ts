// Unit F0.7 — lógica de decisão do scripts/cobertura-operacoes.ts, o gate
// da matriz de 6 casos por operação (plano §9.4): lê as funções de pg_proc
// (schema api) e falha se alguma operação não tiver os casos nomeados
// op:<nome>:<caso>. A quinta ocorrência da classe "verde por não ter olhado
// nada" é a condição (a) da F0.5 aplicada aqui: catálogo vazio é falha com a
// lista nomeada impressa. O vocabulário canônico é congelado — a colisão com
// o código real (sem_sessao em vez de nao_autenticado) é o que faz o script
// nascer vermelho de graça na execução real da evidência.
import { describe, expect, test } from 'vitest';
import {
  VOCABULARIO_CASOS,
  conferirCobertura,
  extrairCasos,
  validarCatalogoOperacoes,
} from '../../scripts/cobertura-operacoes';

describe('vocabulário canônico', () => {
  test('os 6 casos são exatamente estes — congelado no contrato', () => {
    expect(VOCABULARIO_CASOS).toEqual([
      'valida',
      'invalida',
      'nao_autorizado',
      'nao_autenticado',
      'idempotencia',
      'evento',
    ]);
  });
});

describe('condição (a): catálogo de operações', () => {
  test('catálogo vazio é falha — nunca "toda operação coberta" sobre operação nenhuma', () => {
    expect(() => validarCatalogoOperacoes([])).toThrow(/CATALOGO VAZIO/);
  });

  test('catálogo com uma operação não falha', () => {
    expect(() => validarCatalogoOperacoes(['registrar_ping'])).not.toThrow();
  });
});

describe('extração de casos dos arquivos de teste', () => {
  test('test nomeado op:nome:caso vira caso', () => {
    const casos = extrairCasos(["test('op:registrar_ping:valida — cria ping', () => {});"]);
    expect(casos.has('op:registrar_ping:valida')).toBe(true);
  });

  test('caso citado em comentário também conta — documenta o contrato', () => {
    const casos = extrairCasos(['// op:registrar_ping:idempotencia — repetição cria segunda linha']);
    expect(casos.has('op:registrar_ping:idempotencia')).toBe(true);
  });

  test('describe de operação sem segundo dois-pontos não vira caso', () => {
    const casos = extrairCasos(["describe('op:registrar_ping', () => {"]);
    expect(casos.size).toBe(0);
  });

  test('nome com caracteres fora do padrão não vira caso', () => {
    const casos = extrairCasos(['op:registrar-ping:valida', 'op:x:']);
    expect(casos.size).toBe(0);
  });
});

describe('conferência dos 6 casos por operação', () => {
  const CINCO_CASOS = new Set([
    'op:registrar_ping:valida',
    'op:registrar_ping:invalida',
    'op:registrar_ping:nao_autorizado',
    'op:registrar_ping:nao_autenticado',
    'op:registrar_ping:evento',
  ]);

  test('caso faltante é reportado nomeado', () => {
    const faltantes = conferirCobertura(['registrar_ping'], CINCO_CASOS);
    expect(faltantes).toEqual(['op:registrar_ping:idempotencia']);
  });

  test('operação sem nenhum caso reporta os seis', () => {
    expect(conferirCobertura(['registrar_ping'], new Set())).toEqual([
      'op:registrar_ping:valida',
      'op:registrar_ping:invalida',
      'op:registrar_ping:nao_autorizado',
      'op:registrar_ping:nao_autenticado',
      'op:registrar_ping:idempotencia',
      'op:registrar_ping:evento',
    ]);
  });

  test('caso com nome fora do vocabulário não satisfaz nada', () => {
    // colisão real de 2026-08-15: sem_sessao existe no teste congelado mas não
    // é nao_autenticado — o gate tem que acusar os DOIS faltantes
    const casos = new Set([...CINCO_CASOS, 'op:registrar_ping:sem_sessao']);
    expect(conferirCobertura(['registrar_ping'], casos)).toEqual([
      'op:registrar_ping:idempotencia',
    ]);
    const semNaoAutenticado = new Set([
      'op:registrar_ping:valida',
      'op:registrar_ping:invalida',
      'op:registrar_ping:nao_autorizado',
      'op:registrar_ping:evento',
      'op:registrar_ping:sem_sessao',
    ]);
    expect(conferirCobertura(['registrar_ping'], semNaoAutenticado)).toContain(
      'op:registrar_ping:nao_autenticado',
    );
  });

  test('os seis presentes não reportam nada', () => {
    const casos = new Set([...CINCO_CASOS, 'op:registrar_ping:idempotencia']);
    expect(conferirCobertura(['registrar_ping'], casos)).toEqual([]);
  });

  test('cada operação é conferida em separado', () => {
    const casos = new Set([
      ...CINCO_CASOS,
      'op:registrar_ping:idempotencia',
      'op:outra_operacao:valida',
    ]);
    const faltantes = conferirCobertura(['registrar_ping', 'outra_operacao'], casos);
    expect(faltantes.length).toBe(5);
    expect(faltantes.every((f) => f.startsWith('op:outra_operacao:'))).toBe(true);
  });
});
