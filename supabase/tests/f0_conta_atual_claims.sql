-- F0.6 — achado da F0.4, a cobrir nesta tarefa: app.conta_atual() estoura
-- "invalid input syntax for type json" quando request.jwt.claims é string
-- vazia — o cast ::jsonb vinha ANTES do nullif. Inalcançável via PostgREST
-- hoje (anon sem execute → 404 antes de chegar à função), mas é erro latente
-- na fronteira de autorização. O conserto espelha app.usuario_atual(), que
-- faz na ordem certa (nullif antes do cast) — ver migration da F0.6.
begin;
select plan(2);

select set_config('request.jwt.claims', '', true);
select is(app.conta_atual(), null,
  'conta_atual com claims vazio devolve null — nao estoura');

select set_config('request.jwt.claims', '{}', true);
select is(app.conta_atual(), null,
  'conta_atual com claims objeto vazio devolve null');

select * from finish();
rollback;
