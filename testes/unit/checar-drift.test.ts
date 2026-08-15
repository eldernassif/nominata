// Unit F0.7 — lógica de decisão do scripts/checar-drift.ts, o detector do
// modo de falha mais provável de um projeto com MCP conectado (plano §9.6):
// (a) banco e migrations divergentes, (b) tipos versionados divergentes do
// `gen types`, (c) migration já aplicada alterada. A regra anti-teatro exige
// ver cada asserção vermelha mutando aquilo que ela cobre — as três
// checagens têm caso de violação aqui, e as três mutações de aceite rodam em
// execução real na evidência.
import { describe, expect, test } from 'vitest';
import {
  calcularHash,
  compararTipos,
  conferirManifesto,
  interpretarDbDiff,
  normalizarEol,
} from '../../scripts/checar-drift';

describe('checagem (a): db diff --local tem que imprimir vazio', () => {
  test('saída vazia é banco alinhado às migrations', () => {
    expect(interpretarDbDiff('')).toBe(true);
  });

  test('só espaços e quebras também é vazio', () => {
    expect(interpretarDbDiff('   \n  \n')).toBe(true);
  });

  test('qualquer linha é drift — falha', () => {
    expect(interpretarDbDiff('\n-- diff de schema\ncreate table x ();')).toBe(false);
  });
});

describe('checagem (b): gen types regenerado tem que bater com o versionado', () => {
  test('texto idêntico bate', () => {
    expect(compararTipos('export type Json = null;', 'export type Json = null;')).toBe(true);
  });

  test('diferindo só em fim de linha bate — a armadilha CRLF/LF do contrato', () => {
    // arquivo versionado em CRLF (Windows) e CLI emitindo LF não é drift —
    // é a mesma asserção, e a normalização é a decisão declarada na evidência
    expect(compararTipos('a\r\nb\r\n', 'a\nb\n')).toBe(true);
    expect(compararTipos('a\nb', 'a\r\nb')).toBe(true);
  });

  test('conteúdo diferente é drift — falha', () => {
    expect(compararTipos('export type Json = null;', 'export type Json = null | string;')).toBe(
      false,
    );
    expect(compararTipos('a\nb', 'a\nc')).toBe(false);
  });

  test('normalizarEol colapsa CRLF, CR e LF em LF', () => {
    expect(normalizarEol('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });
});

describe('checagem (c): migration aplicada é imutável — manifesto de hashes', () => {
  const MIGRACOES = [
    { nome: '20260814120000_f0_schemas_grants.sql', hash: 'h1' },
    { nome: '20260814130000_f0_ping_rls.sql', hash: 'h2' },
  ];

  test('conjunto exato com hashes batendo não tem violação', () => {
    expect(conferirManifesto(MIGRACOES, { '20260814120000_f0_schemas_grants.sql': 'h1', '20260814130000_f0_ping_rls.sql': 'h2' })).toEqual([]);
  });

  test('arquivo antigo com hash diferente é violação nomeada', () => {
    const violacoes = conferirManifesto(
      MIGRACOES,
      { '20260814120000_f0_schemas_grants.sql': 'h1', '20260814130000_f0_ping_rls.sql': 'h2-alterada' },
    );
    expect(violacoes.length).toBe(1);
    expect(violacoes[0]).toContain('20260814130000_f0_ping_rls.sql');
  });

  test('migration no diretório sem entrada no manifesto é violação — o gate não fica cego', () => {
    const violacoes = conferirManifesto(
      [...MIGRACOES, { nome: '20260815999999_nova.sql', hash: 'h3' }],
      { '20260814120000_f0_schemas_grants.sql': 'h1', '20260814130000_f0_ping_rls.sql': 'h2' },
    );
    expect(violacoes.length).toBe(1);
    expect(violacoes[0]).toContain('20260815999999_nova.sql');
  });

  test('entrada no manifesto sem arquivo no diretório é violação', () => {
    const violacoes = conferirManifesto(MIGRACOES, {
      '20260814120000_f0_schemas_grants.sql': 'h1',
      '20260814130000_f0_ping_rls.sql': 'h2',
      '20260814999999_apagada.sql': 'h3',
    });
    expect(violacoes.length).toBe(1);
    expect(violacoes[0]).toContain('20260814999999_apagada.sql');
  });

  test('calcularHash é sha256 em hex — valor conhecido de "abc"', () => {
    expect(calcularHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
