-- Aviso de transición ONLINE -> OFFLINE del ESP32 a Sistema Admin y Administradores.
-- Nunca envía comandos al equipo ni deduce la posición física del portón.
-- Intervalo de comprobación: 30 segundos. Se considera offline si pasaron 15
-- segundos sin heartbeat, el mismo umbral del Control Digital.
CREATE TABLE IF NOT EXISTS access_private.esp32_alerta_estado (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 estado text NOT NULL DEFAULT 'inicial' CHECK (estado IN ('inicial','online','offline','pausado')),
 cambiado_at timestamptz NOT NULL DEFAULT now(),
 ultimo_contacto timestamptz
);
ALTER TABLE access_private.esp32_alerta_estado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE access_private.esp32_alerta_estado FROM PUBLIC, anon, authenticated;

-- Sembrar una línea base sin generar notificaciones durante la instalación.
-- Si existió una conexión, verificar_esp32_offline detectará que se perdió.
INSERT INTO access_private.esp32_alerta_estado(singleton,estado,ultimo_contacto)
SELECT true,
 CASE WHEN d.enabled AND d.last_seen IS NOT NULL THEN 'online'
      WHEN NOT d.enabled THEN 'pausado' ELSE 'inicial' END,
 d.last_seen
FROM access_private.device d WHERE d.singleton
ON CONFLICT (singleton) DO NOTHING;

-- Cada heartbeat rearma la alerta al reconectar (también si la reconexión
-- es más corta que el intervalo del cron).
CREATE OR REPLACE FUNCTION access_private.esp32_alerta_rearmar_online()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF NEW.enabled IS TRUE AND NEW.last_seen IS NOT NULL
    AND NEW.last_seen IS DISTINCT FROM OLD.last_seen
    AND NEW.last_seen > now() - interval '15 seconds' THEN
  INSERT INTO access_private.esp32_alerta_estado(singleton,estado,cambiado_at,ultimo_contacto)
  VALUES(true,'online',now(),NEW.last_seen)
  ON CONFLICT(singleton) DO UPDATE SET
   estado='online',
   cambiado_at=CASE WHEN access_private.esp32_alerta_estado.estado<>'online'
                    THEN now() ELSE access_private.esp32_alerta_estado.cambiado_at END,
   ultimo_contacto=excluded.ultimo_contacto;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION access_private.esp32_alerta_rearmar_online() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_esp32_alerta_rearmar_online ON access_private.device;
CREATE TRIGGER trg_esp32_alerta_rearmar_online
AFTER UPDATE OF last_seen ON access_private.device
FOR EACH ROW
EXECUTE FUNCTION access_private.esp32_alerta_rearmar_online();

CREATE OR REPLACE FUNCTION access_private.verificar_esp32_offline()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_device access_private.device%rowtype;
 v_estado access_private.esp32_alerta_estado%rowtype;
 v_actual text;
 v_enviadas integer:=0;
BEGIN
 -- El mismo bloqueo del heartbeat evita duplicar transiciones por carreras.
 SELECT * INTO v_device FROM access_private.device WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('estado','sin_dispositivo','notificaciones',0);
 END IF;
 INSERT INTO access_private.esp32_alerta_estado(singleton,estado,ultimo_contacto)
 VALUES(true,CASE WHEN v_device.enabled AND v_device.last_seen IS NOT NULL THEN 'online'
                  WHEN NOT v_device.enabled THEN 'pausado' ELSE 'inicial' END,v_device.last_seen)
 ON CONFLICT (singleton) DO NOTHING;
 SELECT * INTO v_estado FROM access_private.esp32_alerta_estado WHERE singleton FOR UPDATE;

 IF NOT v_device.enabled THEN
  v_actual:='pausado';
 ELSIF v_device.last_seen IS NULL THEN
  v_actual:='inicial';
 ELSIF v_device.last_seen>now()-interval '15 seconds' THEN
  v_actual:='online';
 ELSE
  v_actual:='offline';
 END IF;

 IF v_actual IS DISTINCT FROM v_estado.estado THEN
  UPDATE access_private.esp32_alerta_estado SET
   estado=v_actual, cambiado_at=now(), ultimo_contacto=v_device.last_seen WHERE singleton;
  IF v_actual='offline' AND v_estado.estado='online' THEN
   INSERT INTO public.notificaciones_push(user_id,titulo,mensaje,tipo,referencia,destino)
   SELECT p.id,
    '🔴 Alerta: ESP32 sin conexión',
    'El ESP32 dejó de comunicarse con Administración Residencial. Último contacto: '||
      to_char(v_device.last_seen AT TIME ZONE 'America/Mexico_City','DD/MM/YYYY HH24:MI:SS')||
      ' (hora de México). Revisa alimentación, WiFi e Internet. Esto no confirma si el portón está abierto o cerrado.',
    'esp32_offline',
    'esp32:offline:'||to_char(now() AT TIME ZONE 'UTC','YYYYMMDDHH24MISS')||':'||p.id::text,
    'esp32Panel'
   FROM public.profiles p
   WHERE p.rol IN ('owner','admin') AND p.activo IS TRUE
    AND coalesce(p.estado_registro,'aprobado')='aprobado';
   GET DIAGNOSTICS v_enviadas=ROW_COUNT;
  END IF;
 ELSIF v_actual='online' AND v_estado.ultimo_contacto IS DISTINCT FROM v_device.last_seen THEN
  UPDATE access_private.esp32_alerta_estado SET ultimo_contacto=v_device.last_seen WHERE singleton;
 END IF;
 RETURN jsonb_build_object('estado',v_actual,'notificaciones',v_enviadas,
  'ultimo_contacto',v_device.last_seen);
END $fn$;
REVOKE ALL ON FUNCTION access_private.verificar_esp32_offline() FROM PUBLIC, anon, authenticated;

-- Las cuentas del personal reciben las notificaciones por el sistema ya existente:
-- bandeja en tiempo real + desencadenador actual para web push a sus dispositivos.
SELECT cron.schedule(
 'esp32-alerta-desconexion',
 '30 seconds',
 'SELECT access_private.verificar_esp32_offline();'
);

-- Sustituir el recordatorio diario duplicado del asistente sin alterar otras alertas.
create or replace function public.ia_generar_alertas()
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare hoy date:=(now() at time zone 'America/Mexico_City')::date;
        cuotas_count int:=0; eventos_count int:=0;avisos_count int:=0;
        mes_inicio date;mes_fin date;
begin
 -- Cuotas vencidas o próximas: solo residentes de la casa y con saldo pendiente.
 insert into public.ia_alertas(usuario_id,tipo,titulo,detalle,fecha)
 select p.id,'cuota', 'Cuota '||q.id::text||' · Casa '||c.numero,
 case when q.vencimiento<hoy then 'Cuota vencida el ' else 'Vencimiento el ' end
 ||q.vencimiento::text||'. Saldo estimado: $'||
 round(greatest(q.monto-coalesce(pg.pagado,0),0),2)::text||' MXN.',
 hoy
 from public.cuotas q join public.casas c on c.id=q.casa_id
 join public.profiles p on p.casa_id=c.id and p.rol='residente'
  and p.activo and p.estado_registro='aprobado'
 left join lateral(select sum(monto) as pagado from public.pagos where cuota_id=q.id) pg on true
 where coalesce(q.archivada,false)=false and c.activo
 and q.vencimiento between hoy-interval '30 days' and hoy+interval '3 days'
 and q.monto>coalesce(pg.pagado,0)
 on conflict(usuario_id,tipo,fecha,titulo) do nothing;
 get diagnostics cuotas_count=row_count;

 -- Resumen de aprobaciones pendientes para owner. No autoriza cambios automáticos.
 insert into public.ia_alertas(usuario_id,tipo,titulo,detalle,fecha)
 select p.id,'pendientes','Pendientes administrativos',
 'Residentes sin aprobar: '||(select count(*) from public.profiles where rol='residente' and estado_registro='pendiente')
 ||'; solicitudes de huella: '||(select count(*) from public.solicitudes_huella where estado='pendiente_captura')
 ||'; reservaciones pendientes: '||(select count(*) from public.reservaciones where estado='pendiente')||'.',hoy
 from public.profiles p where p.rol='owner' and p.activo and p.estado_registro='aprobado'
 on conflict(usuario_id,tipo,fecha,titulo) do nothing;
 get diagnostics avisos_count=row_count;

 -- Eventos del día y siguiente, solo recordatorios, nunca relés.
 insert into public.ia_alertas(usuario_id,tipo,titulo,detalle,fecha)
 select p.id,'evento','Evento '||e.id::text||': '||left(e.titulo,100),
 'Programado el '||e.fecha::text||coalesce(' a las '||e.hora::text,'')
 ||'. Verifica la sección Eventos.',hoy
 from public.eventos e cross join public.profiles p
 where e.estado='programado' and e.fecha between hoy and hoy+1
 and p.activo and p.estado_registro='aprobado' and p.rol in ('owner','admin','residente')
 on conflict(usuario_id,tipo,fecha,titulo) do nothing;
 get diagnostics eventos_count=row_count;

 -- Alertas ESP32: ahora se notifican una vez por desconexión a Owner y Admin
 -- mediante access_private.verificar_esp32_offline y su cron de 30 segundos.

 -- Resumen mensual informativo en el primer día del mes, por movimientos con fecha contable.
 if extract(day from hoy)=1 then
   mes_inicio:=(date_trunc('month',hoy::timestamp)-interval '1 month')::date;
   mes_fin:=(date_trunc('month',hoy::timestamp))::date;
   insert into public.ia_alertas(usuario_id,tipo,titulo,detalle,fecha)
   select p.id,'reporte_mensual','Resumen financiero '||to_char(mes_inicio,'YYYY-MM'),
   'Pagos registrados: $'||coalesce((select round(sum(monto),2) from public.pagos
      where fecha>=mes_inicio and fecha<mes_fin),0)::text
   ||'; gastos registrados: $'||coalesce((select round(sum(monto),2) from public.gastos
      where fecha>=mes_inicio and fecha<mes_fin),0)::text
   ||'. Verificar conciliación bancaria antes de su distribución.',hoy
   from public.profiles p where p.rol='owner' and p.activo and p.estado_registro='aprobado'
   on conflict(usuario_id,tipo,fecha,titulo) do nothing;
 end if;
 return pg_catalog.jsonb_build_object('ok',true,'cuotas',cuotas_count,'eventos',eventos_count,'pendientes',avisos_count,'fecha',hoy);
end $$;
revoke all on function public.ia_generar_alertas() from public,anon,authenticated;
-- Sólo el scheduler de PostgreSQL puede ejecutarla. No añadir autenticados.
