-- F0.4 — caso do WITH CHECK da tenant_lock (emenda do arquiteto 2026-08-14).
-- O buraco que este arquivo fecha: a F0.3 provava o isolamento de LEITURA,
-- mas dropar a tenant_lock deixava a suíte verde — nenhum caso exercitava a
-- escrita barrada PELA POLICY.
--
-- Método arbitrado (tarefas.md): a RPC correta nunca aceita conta_id (ele
-- nunca vem do cliente), então a única forma de exercitar a camada é simular
-- o bug contra o qual ela defende — o papel dono das funções definer
-- (app_owner: nologin, nobypassrls, NÃO é dono das tabelas, logo a RLS se
-- aplica) tenta gravar com conta_id alheio. A recusa tem que vir do with
-- check da tenant_lock (RESTRICTIVE), não de validação de função.
--
-- Armadilha 2 (§9.5): sem as guardas este arquivo rodaria como postgres e
-- TODAS as asserções passariam sem policy avaliada.
-- Armadilha 1: leitura negativa é sempre is_empty; escrita barrada por with
-- check é throws_ok — a regra do is_empty vale para leitura, não para escrita.
begin;
select plan(9);

-- setup como postgres (owner, BYPASSRLS): duas contas.
-- IDs fixos, nunca dados reais de prospect.
insert into app.conta (id, nome) values
  ('00000000-0000-0000-0000-0000000000f1', 'conta A'),
  ('00000000-0000-0000-0000-0000000000f2', 'conta B');

-- sessão como app_owner (papel sem login, dono das funções definer) com
-- claim da conta A. Nobypassrls + não-dono de tabela: a RLS se aplica.
select tests.authenticate_as('app_owner',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","app_metadata":{"conta_id":"00000000-0000-0000-0000-0000000000f1"}}');

-- guardas obrigatórias (§9.5), antes de qualquer asserção de isolamento.
select ok(not (select rolbypassrls from pg_roles where rolname = current_user),
  'guarda: papel corrente nao pode ter BYPASSRLS');
select is(current_setting('role', true), 'app_owner',
  'guarda: sessao como app_owner');
select isnt(nullif(current_setting('request.jwt.claims', true), ''), null,
  'guarda: claims de JWT presentes');

-- gravação na própria conta passa: a permissiva autoriza o app_owner e a
-- tenant_lock aceita a linha da própria conta.
select lives_ok(
  $$ insert into app.ping (conta_id, texto) values ('00000000-0000-0000-0000-0000000000f1', 'ping proprio') $$,
  'app_owner grava ping na propria conta');

-- gravação com conta_id da conta B é recusada PELA POLICY (with check da
-- tenant_lock), não por validação de função — a RPC nem aceita conta_id.
-- A mensagem da tenant_lock é asserida de propósito: é a prova de que a
-- recusa veio da policy, não de uma validação da função.
select throws_ok(
  $$ insert into app.ping (conta_id, texto) values ('00000000-0000-0000-0000-0000000000f2', 'tentativa na conta B') $$,
  '42501',
  'new row violates row-level security policy "tenant_lock" for table "ping"',
  'app_owner nao grava ping com conta_id alheio');

-- mesmo padrão no histórico do canário (app.ping_evento)
select lives_ok(
  $$ insert into app.ping_evento (conta_id, tipo, operacao) values ('00000000-0000-0000-0000-0000000000f1', 'ping_registrado', 'registrar_ping') $$,
  'app_owner grava evento na propria conta');
select throws_ok(
  $$ insert into app.ping_evento (conta_id, tipo, operacao) values ('00000000-0000-0000-0000-0000000000f2', 'ping_registrado', 'registrar_ping') $$,
  '42501',
  'new row violates row-level security policy "tenant_lock" for table "ping_evento"',
  'app_owner nao grava evento com conta_id alheio');

-- leitura do histórico: conta B não enxerga o evento da conta A; conta A
-- enxerga apenas o próprio.
reset role;
select tests.authenticate_as('authenticated',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","app_metadata":{"conta_id":"00000000-0000-0000-0000-0000000000f2"}}');
select is_empty(
  $$ select * from app.ping_evento where conta_id = '00000000-0000-0000-0000-0000000000f1' $$,
  'conta B nao enxerga evento da conta A');

reset role;
select tests.authenticate_as('authenticated',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","app_metadata":{"conta_id":"00000000-0000-0000-0000-0000000000f1"}}');
select is((select count(*)::int from app.ping_evento), 1,
  'conta A enxerga apenas o proprio evento');

select * from finish();
rollback;
