-- F0.3 (desvio registrado na evidência): o harness `supabase test db` da CLI
-- 2.114.0 instala só o pgTAP (schema public) durante o run — a extensão
-- supabase_test_helpers, que forneceria o schema `tests` com authenticate_as,
-- NÃO está disponível na imagem local (pg_available_extensions vazio para ela).
-- Sem o helper o contrato F0.3 é impossível: o bloco de guardas do §9.5 exige
-- sessão como `authenticated` com claims presentes, e o arquivo de teste roda
-- como postgres. A função abaixo é o equivalente mínimo, versionada no repo;
-- roda como postgres (security invoker) e faz exatamente o que o helper
-- oficial faz: seta os claims locais e troca o papel da transação.
-- Sem grants para anon/authenticated/public: só o superuser executa.
create schema tests;

create function tests.authenticate_as(role text, claims jsonb default '{}'::jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claims', claims::text, true);
  execute format('set local role %I', role);
end $$;

revoke execute on function tests.authenticate_as(text, jsonb) from public;
revoke all on schema tests from anon, authenticated, public;
