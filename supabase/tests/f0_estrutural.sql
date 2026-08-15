-- F0.6 — gates estruturais de segurança (tarefas.md F0.6).
-- Quatro gates + a asserção de grants reescopada. Cada gate falha quando
-- aparece um item fora da regra; as queries (A), (A') e (C) vêm VERBATIM do
-- plano §4 Camadas 4 e 5. (B) e (D) são novas.
--
-- F0.6.1 — ampliação (tarefas.md F0.6.1): o gate A ganha relkind in ('r','p')
-- e o schema private na lista; entra o gate A' (zero matview). Correção do
-- plano §4 Camada 4 (2026-08-15) — três furos encontrados por execução com a
-- suíte da F0.6 já verde: tabela em private sem RLS passava invisível,
-- matview em api com select para authenticated passava invisível (leitura
-- cross-tenant alcançável de fora — matview não aceita RLS nem
-- security_invoker, e o PostgREST serve matview como tabela), e tabela
-- particionada ficava fora de todos os gates. É defeito do plano, não da
-- execução: a F0.6 copiou a query verbatim, como o contrato mandava.
--
-- Mudança de contrato registrada no plano (2026-08-14): os gates ganham uma
-- lista de isenções DECLARADA, NOMEADA e CONGELADA — o "zero linhas" puro é
-- inexequível na ordem em que as fases acontecem (app.conta/app.usuario sem
-- RLS porque o schema é Fase 1; o hook de token com dono BYPASSRLS porque lê
-- app.usuario antes de o JWT existir). A regra não afrouxa: a exceção é
-- explícita, e a lista é asserida como is(ARRAY(select ...), ARRAY[...]) —
-- o conjunto REAL de fora-da-regra no banco tem que ser EXATAMENTE a lista
-- declarada, nunca @> nem contagem. Crescer a lista exige editar este teste;
-- item novo fora da regra avermelha. E a isenção de tabela só vale enquanto
-- ela tiver ZERO grants para anon/authenticated — tabela sem RLS e sem grant
-- é inalcançável; com grant é buraco aberto.
--
-- Armadilha central da tarefa (quarta ocorrência da classe "verde porque
-- nada foi exercitado"): teste que asserta "zero linhas" num banco onde o
-- problema não existe passa sem exercitar nada — o gate (B) é o caso
-- extremo, não existe view nenhuma. Por isso o aceite exige cada gate VISTO
-- VERMELHO criando temporariamente o objeto que ele proíbe (ver evidência).
-- Este arquivo roda como postgres de propósito: é teste de CATÁLOGO, não de
-- RLS — a consulta ao pg_catalog precisa enxergar tudo.
begin;
select plan(8);

-- GATE A — tabela sem RLS habilitada E forçada, ou sem policy.
-- Query verbatim do plano §4 Camada 4 dentro do ARRAY(select ...), com
-- order by para comparação determinística.
-- F0.6.1: relkind in ('r','p') e private na lista de schemas — a versão
-- anterior deixava tabela particionada e o schema private fora do gate.
-- Isenções: app.conta, app.usuario — RLS delas é Fase 1 (schema completo).
select is(ARRAY(
  select n.nspname||'.'||c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ('public','app','api','private')
    and (not c.relrowsecurity or not c.relforcerowsecurity
         or not exists (select 1 from pg_policy p where p.polrelid = c.oid))
  order by 1
), ARRAY['app.conta','app.usuario']::text[],
  'gate A: fora da regra (sem RLS habilitada e forcada, ou sem policy) e exatamente as isencoes');

select is_empty($$
  select table_schema||'.'||table_name
  from information_schema.role_table_grants
  where grantee in ('anon','authenticated')
    and table_schema = 'app' and table_name in ('conta','usuario')
$$, 'gate A: tabelas isentas com ZERO grants para anon/authenticated — com grant, a isencao seria buraco aberto');

-- GATE A' — materialized view em qualquer schema nosso (F0.6.1, novo).
-- Query verbatim do plano §4 Camada 4. Matview não aceita RLS nem
-- security_invoker: é retrato cross-tenant por construção, e o PostgREST
-- serve matview do schema exposto como serve tabela. Proibida, não
-- "permitida sem grant" (arbitragem do arquiteto, 2026-08-15): a isenção
-- seria indefensável no dia em que alguém precisasse do dado — agregação
-- vai por view security_invoker ou função definer que filtra por
-- app.conta_atual().
select is_empty($$
  select n.nspname||'.'||c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'm' and n.nspname in ('public','app','api','private')
$$, 'gate A-prime: zero materialized view nos schemas do projeto');

-- GATE B — view sem security_invoker = true (novo). Hoje não existe view
-- nenhuma nos schemas do projeto — passar vazio é o comportamento honesto, e
-- por isso o aceite exige a mutação (view sem a opção, criada
-- temporariamente → vermelho).
select is_empty($$
  select n.nspname||'.'||c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'v' and n.nspname in ('public','app','api','private')
    and not ('security_invoker=true' = any (coalesce(c.reloptions, '{}'::text[])))
$$, 'gate B: nenhuma view sem security_invoker = true');

-- GATE C — função security definer sem search_path fixo.
-- Query verbatim do plano §4 Camada 5.
select is_empty($$
  select n.nspname||'.'||p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','api','app','private') and p.prosecdef
    and coalesce(array_to_string(p.proconfig,','),'') not like '%search_path%'
$$, 'gate C: nenhuma funcao security definer sem search_path fixo');

-- GATE D — função security definer cujo dono tem BYPASSRLS (novo).
-- Isenção: public.custom_access_token_hook — lê app.usuario ANTES de o JWT
-- existir (conta_atual() é nulo por construção nesse instante); decidida na
-- Fase 1, quando app.usuario ganhar RLS.
select is(ARRAY(
  select n.nspname||'.'||p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_roles r on r.rolname = pg_get_userbyid(p.proowner)
  where n.nspname in ('public','api','app','private') and p.prosecdef
    and r.rolbypassrls
  order by 1
), ARRAY['public.custom_access_token_hook']::text[],
  'gate D: definer de dono com BYPASSRLS e exatamente o hook isento');

-- GATE GRANTS — emenda 2026-08-14: a query de aceite da F0.2, sem filtro de
-- schema, acusa 44 linhas PERMANENTES em storage/realtime/supabase_functions
-- (instaladas pela imagem do Supabase — revogá-las quebra a plataforma).
-- A asserção estrutural é: zero DML para anon/authenticated restrito aos
-- schemas do projeto, e zero grants de QUALQUER tipo para anon.
select is_empty($$
  select table_schema||'.'||table_name||'.'||privilege_type
  from information_schema.role_table_grants
  where grantee in ('anon','authenticated')
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
    and table_schema in ('public','app','api','private')
$$, 'gate grants: zero INSERT/UPDATE/DELETE/TRUNCATE para anon/authenticated nos schemas do projeto');

select is_empty($$
  select 'tabela '||table_schema||'.'||table_name||'.'||privilege_type
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema in ('public','app','api','private')
  union all
  select 'rotina '||routine_schema||'.'||routine_name||'.'||privilege_type
    from information_schema.role_routine_grants
   where grantee = 'anon' and routine_schema in ('public','app','api','private')
  union all
  select 'schema '||object_schema||'.'||object_type
    from information_schema.role_usage_grants
   where grantee = 'anon' and object_schema in ('public','app','api','private')
$$, 'gate grants: zero grants de qualquer tipo para anon nos schemas do projeto');

select * from finish();
rollback;
