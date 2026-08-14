-- F0.3: identidade de tenant mínima + tabela canário app.ping com RLS.
-- SQL do plano §4.2 (conta, usuario, hook, conta_atual) e §4 Camada 4 (padrão
-- de policy RESTRICTIVE tenant_lock com using E with check).
create table app.conta (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  fuso      text not null default 'America/Sao_Paulo',
  criada_em timestamptz not null default now(),
  constraint conta_fuso_valido check (now() at time zone fuso is not null)
);

-- NENHUMA tabela de negócio referencia auth.users. Custo zero agora, custo de projeto depois.
create table app.usuario (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,          -- sem FK: portabilidade de provedor
  conta_id     uuid not null references app.conta(id),
  papel        text not null default 'dono' check (papel in ('dono','operador')),
  ativo        boolean not null default true,
  nome         text,
  criado_em    timestamptz not null default now()
);
create index on app.usuario (conta_id);

-- O conta_id chega ao banco por claim assinado no JWT, populado por este hook.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := event->'claims'; v_conta uuid;
begin
  select u.conta_id into v_conta from app.usuario u
   where u.auth_user_id = (event->>'user_id')::uuid and u.ativo
   order by u.criado_em limit 1;
  if v_conta is not null then
    claims := jsonb_set(claims,'{app_metadata,conta_id}', to_jsonb(v_conta::text));
  end if;
  return jsonb_set(event,'{claims}',claims);
end $$;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from anon, authenticated, public;

create or replace function app.conta_atual() returns uuid
language sql stable security definer set search_path = '' as $$
  select nullif(current_setting('request.jwt.claims',true)::jsonb
                ->'app_metadata'->>'conta_id','')::uuid
$$;

-- canário: só existe para provar o andaime de verificação; removido na F0.11.
create table app.ping (
  id        uuid primary key default gen_random_uuid(),
  conta_id  uuid not null,
  texto     text,
  criado_em timestamptz not null default now()
);
create index on app.ping (conta_id);

-- leitura direta via RLS (padrão do plano, app.evento §4.4); escrita jamais:
-- Camada 3 exige zero grants de INSERT/UPDATE/DELETE para authenticated.
grant select on app.ping to authenticated;

alter table app.ping enable row level security;
alter table app.ping force  row level security;

-- trava RESTRICTIVE, sem cláusula TO: ANDed com tudo, nenhuma policy futura afrouxa
create policy tenant_lock on app.ping as restrictive for all
  using      ( conta_id = (select app.conta_atual()) )
  with check ( conta_id = (select app.conta_atual()) );

create policy ping_select on app.ping for select to authenticated
  using ( conta_id = (select app.conta_atual()) );
