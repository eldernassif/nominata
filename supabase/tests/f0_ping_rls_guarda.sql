-- F0.3 — prova da guarda (§9.5).
--
-- Este arquivo roda DELIBERADAMENTE como postgres, sem tests.authenticate_as.
-- Se ele enxerga as duas contas, é a prova de que sem authenticate_as o
-- isolamento NÃO é avaliado — e é exatamente por isso que o arquivo de
-- isolamento (f0_ping_rls.sql) carrega o bloco de guardas no topo.
-- Este arquivo NÃO tem as guardas: ele é a demonstração de que elas são necessárias.
begin;
select plan(1);

insert into app.conta (id, nome) values
  ('00000000-0000-0000-0000-0000000000d1', 'conta A (guarda)'),
  ('00000000-0000-0000-0000-0000000000d2', 'conta B (guarda)');
insert into app.ping (id, conta_id, texto) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'ping A'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', 'ping B');

select is((select count(*)::int from app.ping), 2,
  'postgres (BYPASSRLS) enxerga as duas contas: sem authenticate_as o isolamento nao e avaliado');

select * from finish();
rollback;
