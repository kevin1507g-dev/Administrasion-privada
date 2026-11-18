-- Limpieza de datos de proveedores.
-- El secreto no figura aquí: se obtiene de Supabase Vault al ejecutar el job.
select cron.schedule(
 'proveedores-documentos-diaria',
 '0 8 * * *',
 $job$
 select net.http_post(
   url:='https://nndlfkuelwpwklldvtfo.supabase.co/functions/v1/proveedores-registro',
   headers:=jsonb_build_object(
     'Content-Type','application/json',
     'apikey','sb_publishable_f5ZypC_Rs-07K5mKwV-j5A_JrUqHzW_',
     'Authorization','Bearer sb_publishable_f5ZypC_Rs-07K5mKwV-j5A_JrUqHzW_',
     'x-cron-token',(select decrypted_secret from vault.decrypted_secrets where name='proveedores_cleanup_cron')
   ),
   body:='{"accion":"mantenimiento"}'::jsonb,
   timeout_milliseconds:=30000
 );
 $job$
);
select cron.schedule(
 'proveedores-ratelimit-diaria',
 '15 8 * * *',
 $job$
 delete from public.proveedores_consultas_rate where creado_at < now()-interval '2 days';
 $job$
);
