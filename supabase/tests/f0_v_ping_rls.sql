-- F0.8.1 — isolamento da view de leitura api.v_ping (canário de leitura).
-- O app.ping vive no schema app (não exposto ao PostgREST); a SPA lê pings via
-- esta view, único caminho alcançável (Exposed Schemas = api). Contrato do §4.4:
-- leitura por view em api com security_invoker = true, que deixa as policies de
-- app.ping (ping_select + tenant_lock) valerem para o papel do chamador.
--
-- Mesmas armadilhas do f0_ping_rls.sql: bloco de guardas obrigatório (§9.5) e
-- leitura negativa sempre is_empty, nunca throws_ok. O RED desta tarefa é a
-- view ainda não existir: relation "api.v_ping" does not exist.
begin;
select plan(8);

-- setup como postgres (owner, BYPASSRLS): duas contas, um ping em cada.
insert into app.conta (id, nome) values
  ('00000000-0000-0000-0000-0000000000a1', 'conta A'),
  ('00000000-0000-0000-0000-0000000000a2', 'conta B');
insert into app.ping (id, conta_id, texto) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'ping da conta A'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 'ping da conta B');

-- sessão autenticada como a conta A (claim de tenant em app_metadata, nunca
-- user_metadata — regra dura do §4.2).
select tests.authenticate_as('authenticated',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","app_metadata":{"conta_id":"00000000-0000-0000-0000-0000000000a1"}}');

-- guardas obrigatórias (§9.5): rodam antes de qualquer asserção de isolamento.
select ok(not (select rolbypassrls from pg_roles where rolname = current_user),
  'guarda: papel corrente nao pode ter BYPASSRLS');
select is(current_setting('role', true), 'authenticated',
  'guarda: sessao autenticada como authenticated');
select isnt(nullif(current_setting('request.jwt.claims', true), ''), null,
  'guarda: claims de JWT presentes');

-- leitura via view: conta A enxerga apenas o próprio ping (negativa antes da
-- positiva, como no f0_ping_rls — a mesma asserção falhando de forma legível).
select is_empty(
  $$ select * from api.v_ping where id = '00000000-0000-0000-0000-0000000000b2' $$,
  'conta A nao enxerga o ping da conta B via v_ping');
select is((select count(*)::int from api.v_ping), 1,
  'conta A enxerga apenas o proprio ping via v_ping');
select is((select string_agg(texto, ',' order by id) from api.v_ping), 'ping da conta A',
  'conta A enxerga o proprio texto via v_ping');

-- sessão autenticada como a conta B.
reset role;
select tests.authenticate_as('authenticated',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","app_metadata":{"conta_id":"00000000-0000-0000-0000-0000000000a2"}}');
select is_empty(
  $$ select * from api.v_ping where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'conta B nao enxerga o ping da conta A via v_ping');
select is((select count(*)::int from api.v_ping), 1,
  'conta B enxerga apenas o proprio ping via v_ping');

select * from finish();
rollback;
