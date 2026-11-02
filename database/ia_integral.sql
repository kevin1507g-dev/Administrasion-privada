-- Asistente Residencial IA: historial privado, control de costos, operaciones auditadas.
-- Migración aditiva. No modifica ninguna tabla de negocio existente.
create table if not exists public.ia_conversaciones (
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null references auth.users(id) on delete cascade,
 titulo text not null default 'Nueva conversación' check (length(titulo)<=120),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists ia_conversaciones_usuario on public.ia_conversaciones(usuario_id,updated_at desc);
create table if not exists public.ia_mensajes (
 id bigint generated always as identity primary key,
 conversacion_id uuid not null references public.ia_conversaciones(id) on delete cascade,
 usuario_id uuid not null references auth.users(id) on delete cascade,
 rol text not null check (rol in ('user','assistant')),
 contenido text not null check (char_length(contenido) between 1 and 5000),
 created_at timestamptz not null default now()
);
create index if not exists ia_mensajes_conversacion on public.ia_mensajes(conversacion_id,id desc);
create table if not exists public.ia_operaciones (
 id uuid primary key,
 usuario_id uuid not null references auth.users(id) on delete cascade,
 accion text not null,
 objetivo text not null,
 estado text not null default 'pendiente' check (estado in ('pendiente','ejecutada','fallida')),
 resultado jsonb,
 created_at timestamptz not null default now(),
 ejecutada_at timestamptz
);
create index if not exists ia_operaciones_usuario on public.ia_operaciones(usuario_id,created_at desc);
create table if not exists public.ia_preferencias (
 usuario_id uuid primary key references auth.users(id) on delete cascade,
 voz_activada boolean not null default false,
 updated_at timestamptz not null default now()
);
create table if not exists public.ia_alertas (
 id bigint generated always as identity primary key,
 usuario_id uuid not null references auth.users(id) on delete cascade,
 tipo text not null,
 titulo text not null,
 detalle text not null,
 fecha date not null default (now() at time zone 'America/Mexico_City')::date,
 created_at timestamptz not null default now(),
 unique(usuario_id,tipo,fecha,titulo)
);
create index if not exists ia_alertas_usuario on public.ia_alertas(usuario_id,created_at desc);

alter table public.ia_conversaciones enable row level security;
alter table public.ia_mensajes enable row level security;
alter table public.ia_operaciones enable row level security;
alter table public.ia_preferencias enable row level security;
alter table public.ia_alertas enable row level security;
revoke all on public.ia_conversaciones,public.ia_mensajes,public.ia_operaciones,public.ia_preferencias,public.ia_alertas from public,anon,authenticated;
grant select,insert,update,delete on public.ia_conversaciones to authenticated;
grant select,insert on public.ia_mensajes to authenticated;
grant select,insert,update on public.ia_preferencias to authenticated;
grant select on public.ia_operaciones,public.ia_alertas to authenticated;
grant usage,select on sequence public.ia_mensajes_id_seq to authenticated;

create policy ia_conversaciones_select on public.ia_conversaciones for select to authenticated
 using (usuario_id=(select auth.uid()));
create policy ia_conversaciones_insert on public.ia_conversaciones for insert to authenticated
 with check (usuario_id=(select auth.uid()));
create policy ia_conversaciones_update on public.ia_conversaciones for update to authenticated
 using (usuario_id=(select auth.uid())) with check (usuario_id=(select auth.uid()));
create policy ia_conversaciones_delete on public.ia_conversaciones for delete to authenticated
 using (usuario_id=(select auth.uid()));
create policy ia_mensajes_select on public.ia_mensajes for select to authenticated
 using (usuario_id=(select auth.uid()) and exists(select 1 from public.ia_conversaciones c
 where c.id=conversacion_id and c.usuario_id=(select auth.uid())));
-- El usuario solo inserta sus textos, nunca mensajes atribuidos al asistente.
create policy ia_mensajes_insert on public.ia_mensajes for insert to authenticated
 with check (usuario_id=(select auth.uid()) and rol='user' and exists(
 select 1 from public.ia_conversaciones c where c.id=conversacion_id and c.usuario_id=(select auth.uid())));
create policy ia_preferencias_select on public.ia_preferencias for select to authenticated using(usuario_id=(select auth.uid()));
create policy ia_preferencias_insert on public.ia_preferencias for insert to authenticated with check(usuario_id=(select auth.uid()));
create policy ia_preferencias_update on public.ia_preferencias for update to authenticated
 using(usuario_id=(select auth.uid())) with check(usuario_id=(select auth.uid()));
create policy ia_operaciones_select on public.ia_operaciones for select to authenticated using(usuario_id=(select auth.uid()));
create policy ia_alertas_select on public.ia_alertas for select to authenticated using(usuario_id=(select auth.uid()));

-- Servidor conserva control total de mensajes 'assistant' sin exponer escritura RLS al navegador.
-- Acciones exclusivamente permitidas y doble fase preparar -> confirmar.
create or replace function public.ia_operar(p_id uuid,p_accion text default null,p_objetivo text default null,p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare v_uid uuid:=auth.uid();v_rol text;v_casa uuid;v_op public.ia_operaciones%rowtype;
        v_r jsonb;v_obj uuid;
begin
 if v_uid is null then raise exception 'Sesión requerida.' using errcode='42501'; end if;
 select rol,casa_id into v_rol,v_casa from public.profiles
 where id=v_uid and activo is true and coalesce(estado_registro,'aprobado')='aprobado';
 if v_rol not in ('residente','admin','owner') or v_rol is null then raise exception 'Cuenta no autorizada.' using errcode='42501';end if;
 if p_id is null then raise exception 'Identificador de operación requerido.';end if;
 if not p_confirmar then
   if p_accion not in ('cancelar_evento','cancelar_reservacion','eliminar_reporte','solicitar_huella') then
     raise exception 'Operación no disponible.' using errcode='42501';
   end if;
   if p_accion in ('cancelar_evento','cancelar_reservacion','eliminar_reporte') and v_rol<>'owner' then
     raise exception 'Solo Sistema Admin puede realizar esta operación.' using errcode='42501';
   end if;
   if p_accion='solicitar_huella' and (v_rol<>'residente' or p_objetivo not in ('indice_izquierdo','pulgar_derecho')) then
     raise exception 'Solo un residente puede solicitar sus propias huellas.' using errcode='42501';
   end if;
   if p_accion='cancelar_evento' then
     if p_objetivo!~'^[0-9]{1,12}$' or not exists(select 1 from public.eventos where id=p_objetivo::bigint and estado='programado') then
       raise exception 'No se encontró un evento programado.';end if;
   elsif p_accion='cancelar_reservacion' then
     if not exists(select 1 from public.reservaciones where id=p_objetivo::uuid and estado='aprobada') then
       raise exception 'No se encontró una reservación aprobada.';end if;
   elsif p_accion='eliminar_reporte' then
     if not exists(select 1 from public.disciplina_casos where id=p_objetivo::uuid) then
       raise exception 'No se encontró el reporte.';end if;
   elsif p_accion='solicitar_huella' then
     if v_casa is null or not exists(select 1 from public.casas where id=v_casa and activo is true) then
       raise exception 'Tu casa no está habilitada.';end if;
   end if;
   insert into public.ia_operaciones(id,usuario_id,accion,objetivo)
      values(p_id,v_uid,p_accion,p_objetivo) on conflict(id) do nothing;
   select * into v_op from public.ia_operaciones where id=p_id;
   if v_op.usuario_id<>v_uid then raise exception 'Operación ajena.' using errcode='42501';end if;
   return jsonb_build_object('id',v_op.id,'estado',v_op.estado,'accion',v_op.accion,'objetivo',v_op.objetivo);
 end if;
 select * into v_op from public.ia_operaciones where id=p_id and usuario_id=v_uid for update;
 if not found then raise exception 'Operación no encontrada.' using errcode='42501';end if;
 if v_op.estado='ejecutada' then return jsonb_build_object('id',v_op.id,'estado','ejecutada','resultado',v_op.resultado);end if;
 if v_op.estado<>'pendiente' or v_op.created_at<now()-interval '10 minutes' then
   raise exception 'La confirmación caducó. Prepara nuevamente la operación.';end if;
 if v_op.accion in ('cancelar_evento','cancelar_reservacion','eliminar_reporte') and v_rol<>'owner' then
   raise exception 'Solo Sistema Admin.' using errcode='42501';end if;
 if v_op.accion='cancelar_evento' then
   v_r:=public.sistema_admin_cancelar_evento(v_op.objetivo::bigint);
 elsif v_op.accion='cancelar_reservacion' then
   v_r:=public.sistema_admin_cancelar_reservacion(v_op.objetivo::uuid);
 elsif v_op.accion='eliminar_reporte' then
   v_r:=public.sistema_admin_eliminar_reporte_disciplina(v_op.objetivo::uuid);
 elsif v_op.accion='solicitar_huella' then
   if v_rol<>'residente' or v_casa is null or
     not exists(select 1 from public.casas where id=v_casa and activo=true) then
       raise exception 'Solo puedes registrar una solicitud para tu casa.' using errcode='42501';end if;
   insert into public.solicitudes_huella(residente_id,casa_id,dedo,estado)
   values(v_uid,v_casa,v_op.objetivo,'pendiente_captura')
   returning id into v_obj;
   v_r:=jsonb_build_object('ok',true,'solicitud_id',v_obj,'estado','pendiente_captura');
 else
   raise exception 'Acción no permitida.' using errcode='42501';
 end if;
 update public.ia_operaciones set estado='ejecutada',resultado=v_r,ejecutada_at=now() where id=p_id;
 return jsonb_build_object('id',p_id,'estado','ejecutada','resultado',v_r);
end $$;
revoke all on function public.ia_operar(uuid,text,text,boolean) from public,anon;
grant execute on function public.ia_operar(uuid,text,text,boolean) to authenticated;
