-- F0.3 — isolamento do canário app.ping (contrato: enable + force RLS, policy
-- RESTRICTIVE tenant_lock com using E with check, policy permissiva de select).
--
-- Armadilha 2 do plano §9.5: sem tests.authenticate_as este arquivo rodaria como
-- postgres e TODAS as asserções passariam sem nenhuma policy avaliada. As guardas
-- abaixo são o que impede isso — e o arquivo f0_ping_rls_guarda.sql prova que
-- elas são necessárias (roda deliberadamente como postgres e enxerga as duas contas).
--
-- Armadilha 1 (§9.5): leitura negativa é sempre is_empty, nunca throws_ok.
begin;
select plan(8);

-- setup como postgres (owner, BYPASSRLS): duas contas, um ping em cada.
-- IDs fixos, nunca dados reais de prospect.
insert into app.conta (id, nome) values
  ('00000000-0000-0000-0000-0000000000a1', 'conta A'),
  ('00000000-0000-0000-0000-0000000000a2', 'conta B');
insert into app.ping (id, conta_id, texto) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'ping da conta A'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 'ping da conta B');

-- sessão autenticada como a conta A. O claim de tenant é app_metadata.conta_id —
-- regra dura do §4.2: nunca user_metadata, só app_metadata populado pelo hook.
select tests.authenticate_as('authenticated',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","app_metadata":{"conta_id":"00000000-0000-0000-0000-0000000000a1"}}');

-- guardas obrigatórias (§9.5): rodam imediatamente após o authenticate_as e antes
-- de qualquer asserção de isolamento.
select ok(not (select rolbypassrls from pg_roles where rolname = current_user),
  'guarda: papel corrente nao pode ter BYPASSRLS');
select is(current_setting('role', true), 'authenticated',
  'guarda: sessao autenticada como authenticated');
select isnt(nullif(current_setting('request.jwt.claims', true), ''), null,
  'guarda: claims de JWT presentes');

-- leitura: conta A enxerga apenas o próprio ping
select is((select count(*)::int from app.ping), 1,
  'conta A enxerga apenas o proprio ping');
select is((select texto from app.ping), 'ping da conta A',
  'conta A enxerga o proprio texto');
select is_empty(
  $$ select * from app.ping where id = '00000000-0000-0000-0000-0000000000b2' $$,
  'conta A nao enxerga o ping da conta B');

-- (escrita direta como authenticated NÃO é testada aqui de propósito: a Camada 3
-- do plano proíbe grant de INSERT/UPDATE/DELETE para authenticated — o gate da
-- F0.6 exige zero linhas em role_table_grants. O with check da RESTRICTIVE é
-- exercitado pela F0.4, via api.registrar_ping security definer.)

-- sessão autenticada como a conta B: enxerga só o próprio ping.
-- RESET ROLE é comando de sessão (não objeto de schema): restaura o papel de
-- sessão (postgres) mesmo sem USAGE no schema tests, e só então o helper é
-- alcançável de novo.
reset role;
select tests.authenticate_as('authenticated',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","app_metadata":{"conta_id":"00000000-0000-0000-0000-0000000000a2"}}');
select is((select count(*)::int from app.ping), 1,
  'conta B enxerga apenas o proprio ping');
select is_empty(
  $$ select * from app.ping where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'conta B nao enxerga o ping da conta A');

select * from finish();
rollback;
