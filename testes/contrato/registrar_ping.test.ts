// Contrato F0.4 — api.registrar_ping (matriz §9.4: valida/efeito,
// invalida/erro+nada gravado, não autorizado, não autenticado, evento com
// exatamente 1 linha).
//
// op:registrar_ping:idempotencia — contrato da repetição (F0.7): cada chamada
// cria uma linha e um evento por design; a repetição é aceita e produz uma
// SEGUNDA linha e um SEGUNDO evento, com ids distintos. Era "NÃO SE APLICA"
// no contrato F0.4; a F0.7 definiu o comportamento e o caso entrou na matriz.
//
// A leitura negativa cross-tenant roda direto no banco com SET LOCAL ROLE +
// claims (mesma técnica do pgTAP) e guarda do papel corrente — armadilha 2
// do §9.5: sem a guarda o teste rodaria como postgres e o toEqual([])
// passaria sem nenhuma policy avaliada.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  contarEventos,
  contarPings,
  criarConta,
  criarUsuario,
  jwtAutenticado,
  novoSub,
  novoSufixo,
  pool,
  rpc,
  truncarCanario,
  ultimoEvento,
} from './support';

interface CorpoRpc {
  id?: string;
  texto?: string;
  conta_id?: string;
}

describe('op:registrar_ping', () => {
  // banco compartilhado entre suítes: começa limpo e termina limpo (a guarda
  // da F0.3 no harness pgTAP conta as linhas do canário assumindo banco sem
  // resíduos de outras suítes).
  beforeAll(async () => {
    await truncarCanario();
  });

  afterAll(async () => {
    await truncarCanario();
    await pool.end();
  });

  test('op:registrar_ping:valida — cria ping e evento na mesma conta', async () => {
    const conta = await criarConta(`conta-${novoSufixo()}`);
    const sub = novoSub();
    const usuario = await criarUsuario(sub, conta.id);

    const res = await rpc({ texto: 'ping de teste' }, jwtAutenticado(sub, conta.id));
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as CorpoRpc;
    expect(corpo.id).toEqual(expect.any(String));
    expect(corpo.texto).toBe('ping de teste');
    expect(corpo.conta_id).toBe(conta.id);

    expect(await contarPings(conta.id)).toBe(1);
    expect(await contarEventos(conta.id)).toBe(1);
    const evento = await ultimoEvento(conta.id);
    expect(evento?.tipo).toBe('ping_registrado');
    expect(evento?.operacao).toBe('registrar_ping');
    expect(evento?.ator_tipo).toBe('humano');
    expect(evento?.ator_usuario_id).toBe(usuario.id);
    expect(evento?.payload).toEqual({ ping_id: corpo.id });
  });

  test('op:registrar_ping:invalida — texto vazio rejeitado sem gravar nada', async () => {
    const conta = await criarConta(`conta-${novoSufixo()}`);
    const sub = novoSub();
    await criarUsuario(sub, conta.id);
    const jwt = jwtAutenticado(sub, conta.id);

    for (const texto of ['', '   ']) {
      const res = await rpc({ texto }, jwt);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }

    expect(await contarPings(conta.id)).toBe(0);
    expect(await contarEventos(conta.id)).toBe(0);
  });

  test('op:registrar_ping:nao_autorizado — JWT sem conta vinculada rejeitado sem gravar', async () => {
    // usuário existe no app.usuario, mas o JWT não carrega o claim de conta:
    // a autorização vem do token assinado, não de lookup no banco.
    const conta = await criarConta(`conta-${novoSufixo()}`);
    const sub = novoSub();
    await criarUsuario(sub, conta.id);

    const res = await rpc({ texto: 'sem claim de conta' }, jwtAutenticado(sub));
    expect(res.status).toBeGreaterThanOrEqual(400);

    expect(await contarPings(conta.id)).toBe(0);
    expect(await contarEventos(conta.id)).toBe(0);
  });

  test('op:registrar_ping:nao_autenticado — requisição sem token rejeitada sem gravar', async () => {
    const conta = await criarConta(`conta-${novoSufixo()}`);

    const res = await rpc({ texto: 'anônimo' });
    expect(res.status).toBeGreaterThanOrEqual(400);

    expect(await contarPings(conta.id)).toBe(0);
    expect(await contarEventos(conta.id)).toBe(0);
  });

  test('op:registrar_ping:evento — exatamente 1 evento com tipo, ator e timestamp corretos', async () => {
    const conta = await criarConta(`conta-${novoSufixo()}`);
    const sub = novoSub();
    const usuario = await criarUsuario(sub, conta.id);
    const antes = Date.now();

    const res = await rpc({ texto: 'com evento' }, jwtAutenticado(sub, conta.id));
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as CorpoRpc;

    // exatamente 1 evento novo: a conta nasceu vazia neste teste
    expect(await contarEventos(conta.id)).toBe(1);
    const evento = await ultimoEvento(conta.id);
    expect(evento?.tipo).toBe('ping_registrado');
    expect(evento?.ator_tipo).toBe('humano');
    expect(evento?.ator_usuario_id).toBe(usuario.id);
    expect(evento?.payload).toEqual({ ping_id: corpo.id });
    // ocorrido_em sempre calculado no banco, próximo de agora
    expect(evento?.ocorrido_em).toBeInstanceOf(Date);
    const ocorrido = evento?.ocorrido_em?.getTime() ?? 0;
    expect(ocorrido).toBeGreaterThanOrEqual(antes - 1000);
    expect(Math.abs(Date.now() - ocorrido)).toBeLessThan(5 * 60 * 1000);
  });

  test('op:registrar_ping:idempotencia — repetição cria segunda linha e segundo evento, ids distintos', async () => {
    const conta = await criarConta(`conta-${novoSufixo()}`);
    const sub = novoSub();
    await criarUsuario(sub, conta.id);
    const jwt = jwtAutenticado(sub, conta.id);

    const primeira = await rpc({ texto: 'repetido' }, jwt);
    expect(primeira.status).toBe(200);
    const corpo1 = (await primeira.json()) as CorpoRpc;

    const segunda = await rpc({ texto: 'repetido' }, jwt);
    expect(segunda.status).toBe(200);
    const corpo2 = (await segunda.json()) as CorpoRpc;

    expect(corpo2.id).not.toBe(corpo1.id);
    expect(await contarPings(conta.id)).toBe(2);
    expect(await contarEventos(conta.id)).toBe(2);
  });

  test('op:registrar_ping:leitura_cross_tenant — conta B nao enxerga linha da conta A', async () => {
    const contaA = await criarConta(`conta-${novoSufixo()}`);
    const subA = novoSub();
    await criarUsuario(subA, contaA.id);
    const contaB = await criarConta(`conta-${novoSufixo()}`);
    const subB = novoSub();
    await criarUsuario(subB, contaB.id);

    const res = await rpc({ texto: 'ping da A' }, jwtAutenticado(subA, contaA.id));
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as CorpoRpc;

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: subB, app_metadata: { conta_id: contaB.id } }),
      ]);

      // armadilha 2: prova de que o papel corrente é mesmo authenticated
      const guarda = await client.query<{ papel: string }>(
        'select current_user as papel',
      );
      expect(guarda.rows[0]?.papel).toBe('authenticated');

      // armadilha 1: leitura negativa é toEqual([]), nunca exceção
      const linhas = await client.query<{ id: string }>(
        'select * from app.ping where id = $1',
        [corpo.id],
      );
      expect(linhas.rows).toEqual([]);

      await client.query('rollback');
    } catch (erro) {
      await client.query('rollback');
      throw erro;
    } finally {
      client.release();
    }
  });
});
