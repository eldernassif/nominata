-- QUEBRA PROPOSITAL F0.9 item 8b: 1 byte para provar que checar-drift barra migration ja aplicada
-- F0.2: schemas, grants e superfície exposta.
-- Layout do plano §4.1: app (tabelas, não exposto), api (único exposto), private (fechado).
create schema app;
create schema api;
create schema private;

-- fechar o padrão antes de qualquer coisa: nenhum objeto novo em `public`
-- ganha privilégio para anon/authenticated. As migrations rodam como `postgres`,
-- então os defaults deste papel são os que valem para o schema do projeto.
-- (A CLI 2.114.0 concede TRUNCATE por default ao papel `postgres` em `public`,
-- além do `select/insert/update/delete` do plano — o revoke precisa ser completo.
-- Defaults do `supabase_admin` não são revogáveis por `postgres` (42501) e não
-- afetam o schema do projeto: os objetos internos do Supabase não ficam em `public`.)
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, public;
revoke all on schema public from anon, authenticated;
revoke all on schema private from anon, authenticated, public;

grant usage on schema app, api to authenticated;
-- INVARIANTE: zero grants para `anon` em qualquer objeto do sistema.
