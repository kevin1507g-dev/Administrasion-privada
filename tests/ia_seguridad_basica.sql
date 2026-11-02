-- Pruebas de esquema/privilegios. No crean pagos, no modifican portones ni usuarios.
do $$
declare n int;
begin
 select count(*) into n from pg_tables
 where schemaname='public' and tablename in
 ('ia_conversaciones','ia_mensajes','ia_operaciones','ia_alertas','ia_preferencias','ia_configuracion') and rowsecurity;
 if n<>6 then raise exception 'RLS faltante: % de 6',n;end if;
 if has_table_privilege('anon','public.ia_mensajes','select')
 or has_table_privilege('authenticated','public.ia_mensajes','update')
 or has_table_privilege('authenticated','public.ia_operaciones','insert')
 or has_function_privilege('anon','public.ia_operar(uuid,text,text,boolean)','execute')
 then raise exception 'Privilegios inseguros en la IA';end if;
 if not exists(select 1 from cron.job where jobname='asistente_residencial_alertas_diarias' and active)
 then raise exception 'No está activa la automatización';end if;
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='ia_operar' and p.prosecdef)
 then raise exception 'Falta RPC de operaciones';end if;
end $$;
-- Verifica ausencia de credenciales: auth.uid() es null desde la conexión de mantenimiento.
-- Para pruebas por rol, usar sesiones reales de prueba (no fingir identidad de un residente).
