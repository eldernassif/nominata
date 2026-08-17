-- F0.8: view de leitura do canário (api.v_ping). Leitura por view em api com
-- security_invoker = true (plano §4.4): as policies de app.ping (ping_select +
-- tenant_lock) valem para o papel do chamador. app.ping fica no schema app, que
-- nao e exposto; esta view e o unico caminho alcançável pelo PostgREST.
-- Removida junto com o canário na F0.11.
create view api.v_ping with (security_invoker = true) as
  select id, conta_id, texto, criado_em from app.ping;

grant select on api.v_ping to authenticated;
