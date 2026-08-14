-- F0.6: gates estruturais (tarefas.md F0.6) — as correções que os testes
-- novos exigem, e nada além:
--
-- (1) ordem do nullif em app.conta_atual(): o cast ::jsonb vinha ANTES do
--     nullif e estourava "invalid input syntax for type json" com claims
--     vazio (achado da F0.4). Espelha app.usuario_atual(), que já faz na
--     ordem certa. Teste: supabase/tests/f0_conta_atual_claims.sql.
-- (2) alter owner para app_owner: conta_atual não toca tabela nenhuma (só
--     current_setting) e usuario_atual lê app.usuario, que hoje não tem
--     RLS — nenhuma das duas depende de BYPASSRLS para funcionar. Sem isso,
--     no dia em que a Fase 1 ligar RLS em app.usuario, a leitura ignoraria
--     a policy (gate D). Conferido pelo arquiteto por leitura do corpo das
--     duas (tarefas.md F0.6): se a suíte ficar vermelha depois do alter
--     owner, é achado legítimo e para-e-reporta, não conserto por tentativa.
-- O hook de token (public.custom_access_token_hook) PERMANECE de dono
-- postgres: é a isenção declarada e congelada do gate D — decidida na
-- Fase 1, quando app.usuario ganhar RLS.
--
-- O alter owner exige set_option no papel de destino (postgres já tem
-- membership com SET TRUE em app_owner desde a F0.4) E privilégio CREATE no
-- schema do objeto para o papel de destino — a F0.4 precisou do mesmo para o
-- schema api ("create: exigência do alter owner"); aqui as duas funções
-- vivem em app, que só tem USAGE para app_owner.
grant create on schema app to app_owner;

-- usuario_atual é security definer: com o dono novo (app_owner), passa a ler
-- app.usuario com os privilégios DELE — antes lia como postgres, dono da
-- tabela. O grant explícito é o mesmo padrão das tabelas do canário (F0.4):
-- privilégio concedido ao dono da função, nunca BYPASSRLS. Sem ele a gravação
-- de evento morre no default ator_usuario_id (42501 — visto por execução na
-- suíte, testes 6/7/9 do f0_registrar_ping_rls).
grant select on app.usuario to app_owner;

create or replace function app.conta_atual() returns uuid
language sql stable security definer set search_path = '' as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb
                ->'app_metadata'->>'conta_id', '')::uuid
$$;

alter function app.conta_atual() owner to app_owner;
alter function app.usuario_atual() owner to app_owner;
