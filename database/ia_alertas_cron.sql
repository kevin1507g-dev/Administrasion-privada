-- Alertas informativas recurrentes. Sin cobros, multas, suspensiones ni comandos de portón.
-- Cron a las 08:05 h de Ciudad de México (14:05 UTC); TZ México sin horario de verano.
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

 -- Estado de comunicación sin afirmar que el portón esté abierto o cerrado.
 insert into public.ia_alertas(usuario_id,tipo,titulo,detalle,fecha)
 select p.id,'esp32','ESP32 sin comunicación reciente',
 'El último contacto con el ESP32 supera 60 segundos. Revisar la conectividad; no confirma el estado del portón.',hoy
 from public.profiles p
 where p.rol='owner' and p.activo and p.estado_registro='aprobado'
 and exists(select 1 from access_private.device d where d.singleton and d.enabled
   and (d.last_seen is null or d.last_seen<now()-interval '60 seconds'))
 on conflict(usuario_id,tipo,fecha,titulo) do nothing;

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
select cron.schedule('asistente_residencial_alertas_diarias','5 14 * * *','select public.ia_generar_alertas();');
