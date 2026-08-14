-- F0.4: operação api.registrar_ping + histórico descartável do canário
-- (app.ping_evento, arbitragem 2026-08-14: tabela própria, removida na F0.11;
-- sem FK para app.evento_tipo, sem válvula LGPD, sem check de alvo) + papel
-- app_owner (Camada 4, §4 do plano).
--
-- app_owner: papel sem login e sem BYPASSRLS, dono das funções definer. Uma
-- função definer de dono postgres rodaria com BYPASSRLS e a tenant_lock
-- nunca seria avaliada dentro da operação.
create role app_owner nologin nobypassrls;

-- autor do evento por default, nunca por parâmetro: resolve o usuário do
-- contrato pelo sub do JWT (nunca user_metadata — o próprio usuário edita).
create or replace function app.usuario_atual() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from app.usuario u
   where u.auth_user_id =
         (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
     and u.ativo
   order by u.criado_em limit 1
$$;
revoke execute on function app.usuario_atual() from public;
grant execute on function app.usuario_atual() to app_owner;

create table app.ping_evento (
  id              bigint generated always as identity primary key,
  conta_id        uuid not null,
  ocorrido_em     timestamptz not null default now(),
  tipo            text not null,
  operacao        text not null,
  ator_tipo       text not null default 'humano',
  ator_usuario_id uuid default app.usuario_atual(),
  payload         jsonb not null default '{}'::jsonb
);
create index on app.ping_evento (conta_id, id desc);

-- leitura direta via RLS (padrão do plano §4.4); escrita só para o papel
-- dono das funções.
grant select on app.ping_evento to authenticated;
grant insert on app.ping_evento to app_owner;
grant usage on sequence app.ping_evento_id_seq to app_owner;

alter table app.ping_evento enable row level security;
alter table app.ping_evento force  row level security;

-- trava RESTRICTIVE, sem cláusula TO: ANDed com tudo, nenhuma policy futura afrouxa
create policy tenant_lock on app.ping_evento as restrictive for all
  using      ( conta_id = (select app.conta_atual()) )
  with check ( conta_id = (select app.conta_atual()) );

create policy ping_evento_select on app.ping_evento for select to authenticated
  using ( conta_id = (select app.conta_atual()) );

-- Precisão do arquiteto 2026-08-14 (§4 Camada 4): a policy PERMISSIVA de
-- escrita para o papel dono das funções leva with check (true), com o
-- conteúdo dela na cláusula TO. Repetir aqui o predicado de tenant tornaria
-- o critério de aceite da F0.4 impossível — dropar a tenant_lock deixaria a
-- cópia barrando e a suíte continuaria verde (o furo da F0.3 reproduzido).
-- A permissiva diz QUEM escreve; a RESTRICTIVE diz EM QUAIS LINHAS. A regra
-- de tenant vive num lugar só: a tenant_lock.
create policy ping_evento_insert on app.ping_evento for insert to app_owner
  with check ( true );

-- mesma dupla de policies no app.ping (a RESTRICTIVE já existe desde a F0.3)
create policy ping_insert on app.ping for insert to app_owner
  with check ( true );
grant insert on app.ping to app_owner;

-- superfície mínima: quem chama conta_atual é quem a avalia — authenticated
-- (policies de leitura) e app_owner (escrita via funções definer).
revoke execute on function app.conta_atual() from public;
grant execute on function app.conta_atual() to authenticated, app_owner;

grant usage on schema app to app_owner;
grant usage, create on schema api to app_owner; -- create: exigência do alter owner

-- O harness do `supabase test db` instala o pgTAP no schema `extensions`
-- (verificado por execução: as funções ok/is vivem lá durante o run). O
-- stack concede USAGE em extensions a anon/authenticated/service_role, mas
-- não a papéis custom: sem USAGE, o PostgreSQL omite as funções do schema
-- na resolução e o erro é "function does not exist" — exatamente o que os
-- testes pgTAP como app_owner enfrentavam. USAGE só torna o schema
-- pesquisável; não concede execute em objeto algum.
grant usage on schema extensions to app_owner;

-- template fixo do plano (linha 571): assinatura -> resolver tenant ->
-- validar -> escrever estado -> evento -> retornar. O conta_id vem do claim
-- assinado em app_metadata (populado pelo hook), nunca de parâmetro.
create or replace function api.registrar_ping(texto text)
returns jsonb
language plpgsql
security definer
set search_path = '' as $$
declare
  v_conta   uuid := app.conta_atual();
  v_ping_id uuid;
begin
  -- autorização: sem claim de conta assinado, sem operação (42501)
  if v_conta is null then
    raise exception 'sessao sem conta vinculada'
      using errcode = '42501';
  end if;

  -- validação semântica via PGRST com payload JSON (plano, linha 569)
  if nullif(btrim(coalesce(texto, '')), '') is null then
    raise exception using
      errcode = 'PGRST',
      message = json_build_object('codigo', 'texto_vazio',
                                  'detalhe', 'o texto do ping nao pode ser vazio')::text;
  end if;

  -- id gerado aqui, sem RETURNING: o RETURNING reaplicaria as políticas de
  -- SELECT do papel corrente (app_owner não tem permissiva de leitura, por
  -- design) e falharia com "new row violates row-level security policy"
  -- mesmo com o with check aprovado.
  v_ping_id := gen_random_uuid();
  insert into app.ping (id, conta_id, texto)
  values (v_ping_id, v_conta, texto);

  insert into app.ping_evento (conta_id, tipo, operacao, payload)
  values (v_conta, 'ping_registrado', 'registrar_ping',
          jsonb_build_object('ping_id', v_ping_id));

  return jsonb_build_object('id', v_ping_id, 'conta_id', v_conta, 'texto', texto);
end $$;

-- O papel que aplica migrations no stack local é `postgres` NÃO-superuser (o
-- superuser é supabase_admin), e ALTER ... OWNER TO exige que o executor possa
-- SET ROLE no papel de destino — set_option, não basta membership (verificado:
-- a reconciliação do stack reconcede membership com SET FALSE, que falha no
-- alter owner). A membership com SET TRUE fica permanente, como o stack já faz
-- para anon/authenticated/service_role: é o que permite ao pgTAP (F0.4) e ao
-- rls-mutacao (F0.5) SET ROLE app_owner a partir de postgres para exercitar a
-- tenant_lock. Não dá a postgres nada que ele já não tenha como dono das tabelas.
grant app_owner to postgres with set true;
alter function api.registrar_ping(text) owner to app_owner;
grant execute on function api.registrar_ping(text) to authenticated;
revoke execute on function api.registrar_ping(text) from public;
