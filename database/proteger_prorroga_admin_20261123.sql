-- Proteger prórrogas vigentes concedidas por Sistema Admin.
-- Solo impide nuevas suspensiones realizadas por el rol admin, no alteraciones del owner ni tareas de servicio.
CREATE OR REPLACE FUNCTION public.proteger_prorroga_sistema_admin_controles()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_rol text;
 v_casa uuid;
 v_numero text;
 v_hasta timestamptz;
BEGIN
 IF new.estado IS DISTINCT FROM 'suspendido' THEN RETURN new; END IF;
 IF TG_OP='UPDATE' THEN
   IF old.estado='suspendido' THEN RETURN new; END IF;
 END IF;
 SELECT p.rol INTO v_rol FROM public.profiles p
 WHERE p.id=auth.uid() AND p.activo IS TRUE AND p.estado_registro='aprobado';
 IF v_rol IS DISTINCT FROM 'admin' THEN RETURN new; END IF;
 v_casa:=coalesce(new.casa_id,
   (SELECT p.casa_id FROM public.profiles p WHERE p.id=new.residente_id),
   (SELECT c.id FROM public.casas c WHERE c.numero=new.unidad LIMIT 1));
 IF v_casa IS NULL THEN RETURN new; END IF;
 SELECT g.vigente_hasta,c.numero INTO v_hasta,v_numero
 FROM public.prorrogas_mora_controles g
 JOIN public.casas c ON c.id=g.casa_id
 WHERE g.casa_id=v_casa AND g.revocado_en IS NULL AND g.vigente_hasta>now();
 IF v_hasta IS NOT NULL THEN
  RAISE EXCEPTION 'Sistema Admin otorgó días adicionales a la casa % hasta el %. No puedes bloquear sus controles mientras la prórroga esté vigente.',
   v_numero,to_char(v_hasta AT TIME ZONE 'America/Mexico_City','DD/MM/YYYY HH24:MI')
   USING errcode='42501';
 END IF;
 RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_prorroga_sistema_admin_controles() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS zz_proteger_prorroga_sistema_admin_controles ON public.controles_residenciales;
CREATE TRIGGER zz_proteger_prorroga_sistema_admin_controles
 BEFORE INSERT OR UPDATE OF estado,casa_id,residente_id,unidad ON public.controles_residenciales
 FOR EACH ROW EXECUTE FUNCTION public.proteger_prorroga_sistema_admin_controles();

-- Aplicar el mismo aviso en preparación y confirmación de la IA.
-- Usamos las definiciones existentes para preservar sus otras acciones y permisos.
DO $patch$
DECLARE
 v_sql text;
 v_before text;
 v_after text;
BEGIN
 v_sql:=pg_get_functiondef('public.ia_operar(uuid,text,text,boolean)'::regprocedure);
 v_before:='v_r jsonb;v_obj uuid;v_target_house uuid;v_numero text;v_total integer;v_changed integer;';
 v_after:='v_r jsonb;v_obj uuid;v_target_house uuid;v_numero text;v_total integer;v_changed integer;v_prorroga_hasta timestamptz;';
 IF position(v_before IN v_sql)=0 THEN
   RAISE EXCEPTION 'La definición de ia_operar cambió: revisa la migración.';
 END IF;
 v_sql:=replace(v_sql,v_before,v_after);

 v_before:='     if v_total=0 then raise exception ''No hay controles registrados en esta casa.'';end if;';
 v_after:=v_before || E'\n' ||
 '     if v_rol=''admin'' then
       select vigente_hasta into v_prorroga_hasta
       from public.prorrogas_mora_controles
       where casa_id=v_target_house and revocado_en is null and vigente_hasta>now();
       if v_prorroga_hasta is not null then
         raise exception ''Sistema Admin otorgó días adicionales a la casa % hasta el %. No puedes bloquear sus controles mientras la prórroga esté vigente.'',
           p_objetivo,to_char(v_prorroga_hasta at time zone ''America/Mexico_City'',''DD/MM/YYYY HH24:MI'')
           using errcode=''42501'';
       end if;
     end if;';
 IF position(v_before IN v_sql)=0 THEN
   RAISE EXCEPTION 'No se encontró el punto de preparación de bloqueo IA.';
 END IF;
 v_sql:=replace(v_sql,v_before,v_after);

 v_before:='   if v_total=0 then raise exception ''La casa no tiene controles registrados.'';end if;
   update public.controles_residenciales set';
 v_after:='   if v_total=0 then raise exception ''La casa no tiene controles registrados.'';end if;
   if v_rol=''admin'' then
     select vigente_hasta into v_prorroga_hasta
     from public.prorrogas_mora_controles
     where casa_id=v_target_house and revocado_en is null and vigente_hasta>now();
     if v_prorroga_hasta is not null then
       raise exception ''Sistema Admin otorgó días adicionales a la casa % hasta el %. No puedes bloquear sus controles mientras la prórroga esté vigente.'',
         v_numero,to_char(v_prorroga_hasta at time zone ''America/Mexico_City'',''DD/MM/YYYY HH24:MI'')
         using errcode=''42501'';
     end if;
   end if;
   update public.controles_residenciales set';
 IF position(v_before IN v_sql)=0 THEN
   RAISE EXCEPTION 'No se encontró el punto de confirmación de bloqueo IA.';
 END IF;
 v_sql:=replace(v_sql,v_before,v_after);
 EXECUTE v_sql;
END;
$patch$;
