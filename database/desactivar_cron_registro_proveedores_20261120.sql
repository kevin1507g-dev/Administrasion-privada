-- Registro de proveedores retirado del Portal de la Privada.
-- Los dos trabajos pertenecían exclusivamente al registro de documentos
-- y limpieza de límites de consulta; no afectan al Portero Virtual general.
select cron.unschedule(jobid)
from cron.job
where jobname in ('proveedores-documentos-diaria','proveedores-ratelimit-diaria');

-- Se preservan tablas y migraciones antiguas (sin registros actualmente)
-- para evitar eliminar históricos o romper referencias de claves foráneas.
