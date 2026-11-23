-- IA: bloqueo administrativo de controles con preparación y confirmación. No realiza cambios al instalar.
CREATE OR REPLACE FUNCTION public.ia_operar(p_id uuid, p_accion text DEFAULT NULL::text, p_objetivo text DEFAULT NULL::text, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_rol text;v_casa uuid;v_op public.ia_operaciones%rowtype;
        v_r jsonb;v_obj uuid;v_target_house uuid;v_numero text;v_total integer;v_changed integer;
begin
 if v_uid is null then raise exception 'Sesión requerida.' using errcode='42501'; end if;
 select rol,casa_id into v_rol,v_casa from public.profiles
 where id=v_uid and activo is true and coalesce(estado_registro,'aprobado')='aprobado';
 if v_rol not in ('residente','admin','owner') or v_rol is null then raise exception 'Cuenta no autorizada.' using errcode='42501';end if;
 if p_id is null then raise exception 'Identificador de operación requerido.';end if;
 if not p_confirmar then
   if p_accion not in ('cancelar_evento','cancelar_reservacion','eliminar_reporte','solicitar_huella','bloquear_controles') then
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
   if p_accion='bloquear_controles' then
     if v_rol not in ('admin','owner') then
       raise exception 'Solo Administración o Sistema Admin puede bloquear controles.' using errcode='42501';
     end if;
     if p_objetivo is null or p_objetivo !~ '^(4[0-9]|5[0-9]|6[0-6])$' then
       raise exception 'Indica una casa entre 40 y 66.';
     end if;
     if p_objetivo='45' and v_rol<>'owner' then
       raise exception 'La casa 45 requiere Sistema Admin.' using errcode='42501';
     end if;
     select id into v_target_house from public.casas where numero=p_objetivo and activo=true;
     if v_target_house is null then raise exception 'Casa inexistente o inactiva.';end if;
     select count(*) into v_total from public.controles_residenciales where casa_id=v_target_house;
     if v_total=0 then raise exception 'No hay controles registrados en esta casa.';end if;
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
 elsif v_op.accion='bloquear_controles' then
   if v_rol not in ('owner','admin') then
     raise exception 'Solo Administración y Sistema Admin pueden confirmar bloqueos.' using errcode='42501';
   end if;
   v_numero:=v_op.objetivo;
   if v_numero is null or v_numero !~ '^(4[0-9]|5[0-9]|6[0-6])$' then
     raise exception 'Número de casa inválido.';
   end if;
   if v_numero='45' and v_rol<>'owner' then
     raise exception 'Casa 45: solo Sistema Admin.' using errcode='42501';
   end if;
   select id into v_target_house from public.casas where numero=v_numero and activo=true;
   if v_target_house is null then raise exception 'La casa ya no está activa.';end if;
   select count(*) into v_total from public.controles_residenciales where casa_id=v_target_house;
   if v_total=0 then raise exception 'La casa no tiene controles registrados.';end if;
   update public.controles_residenciales set
      estado='suspendido',suspension_automatica=false,
      motivo_suspension='Bloqueo temporal autorizado desde IA por Administración',
      actualizado_por=v_uid,actualizado_en=now()
   where casa_id=v_target_house and estado='activo' and coalesce(bloqueo_owner,false)=false;
   get diagnostics v_changed=row_count;
   if v_changed=0 then raise exception 'Los controles ya están suspendidos o protegidos.';end if;
   v_r:=jsonb_build_object('ok',true,'casa',v_numero,'controles_bloqueados',v_changed,
      'nota','La casa queda suspendida en Control Digital. Los mandos de radiofrecuencia no se desprograman automáticamente.');
 else
   raise exception 'Acción no permitida.' using errcode='42501';
 end if;
 update public.ia_operaciones set estado='ejecutada',resultado=v_r,ejecutada_at=now() where id=p_id;
 return jsonb_build_object('id',p_id,'estado','ejecutada','resultado',v_r);
end $function$;
