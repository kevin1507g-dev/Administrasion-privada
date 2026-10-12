begin;
do $$
declare r uuid; h uuid; h2 uuid; v uuid; cmd uuid; t text:=repeat('a',64); blocked boolean; q bigint; j jsonb;
begin
 select id into r from public.profiles where rol='residente' and activo and coalesce(estado_registro,'aprobado')='aprobado' limit 1;
 if r is null then raise exception 'Missing resident fixture'; end if;
 insert into public.casas(numero,nombre,activo) values('TEST-'||substr(gen_random_uuid()::text,1,8),'Delivery test',true) returning id into h;
 insert into public.casas(numero,nombre,activo) values('TEST-'||substr(gen_random_uuid()::text,1,8),'Other house',true) returning id into h2;
 update public.profiles set casa_id=h where id=r;
 delete from access_private.commands;
 insert into access_private.device(singleton,token_hash,enabled,residents_enabled,last_seen,last_requested)
 values(true,extensions.digest(t,'sha256'),true,true,now(),null)
 on conflict(singleton) do update set token_hash=excluded.token_hash,enabled=true,residents_enabled=true,last_seen=now(),last_requested=null;
 insert into public.entregas_contacto(casa_id,tipo) values(h,'visita') returning id into v;
 perform set_config('request.jwt.claim.sub','',true);
 blocked:=false; begin perform public.digital_access_delivery_request(v,'peatonal'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Anonymous allowed'; end if;
 perform set_config('request.jwt.claim.sub',r::text,true);
 update public.entregas_contacto set casa_id=h2 where id=v;
 blocked:=false; begin perform public.digital_access_delivery_request(v,'peatonal'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Other house allowed'; end if;
 update public.entregas_contacto set casa_id=h,expires_at=now()-interval '1 second' where id=v;
 blocked:=false; begin perform public.digital_access_delivery_request(v,'peatonal'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Expired allowed'; end if;
 update public.entregas_contacto set expires_at=now()+interval '10 minutes' where id=v;
 update access_private.device set residents_enabled=false;
 blocked:=false; begin perform public.digital_access_delivery_request(v,'peatonal'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Disabled residents allowed'; end if;
 update access_private.device set residents_enabled=true,last_seen=now()-interval '1 minute';
 blocked:=false; begin perform public.digital_access_delivery_request(v,'peatonal'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Offline allowed'; end if;
 if (select estado from public.entregas_contacto where id=v)<>'esperando' then raise exception 'Failed request consumed delivery'; end if;
 update access_private.device set last_seen=now();
 insert into public.cuotas(residente_id,casa_id,concepto,monto,vencimiento)
 values(r,h,'Delivery test',60,(now() at time zone 'America/Mexico_City')::date-10) returning id into q;
 blocked:=false; begin perform public.digital_access_delivery_request(v,'peatonal'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Arrears bypass'; end if;
 delete from public.cuotas where id=q;
 cmd:=public.digital_access_delivery_request(v,'peatonal');
 if (select respuesta from public.entregas_contacto where id=v)<>'acceso_peatonal' then raise exception 'Missing atomic response'; end if;
 if public.digital_access_delivery_request(v,'peatonal')<>cmd or (select count(*) from access_private.commands)<>1 then raise exception 'Duplicate command'; end if;
 blocked:=false; begin perform public.digital_access_delivery_request(v,'porton'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Second target allowed'; end if;
 j:=public.digital_access_exchange(t,false,null);
 if j#>>'{command,id}'<>cmd::text or j#>>'{command,target}'<>'peatonal' then raise exception 'Wrong dispatch'; end if;
 perform public.digital_access_exchange(t,false,cmd);
 if public.digital_access_status(cmd)->>'command_state'<>'pulse_confirmed' then raise exception 'Missing acknowledgement'; end if;
 -- A second delivery exercises the gate path.
 update access_private.commands set created_at=now()-interval '10 seconds';
 update access_private.device set last_requested=null;
 insert into public.entregas_contacto(casa_id,tipo) values(h,'comida') returning id into v;
 cmd:=public.digital_access_delivery_request(v,'porton');
 if (select respuesta from public.entregas_contacto where id=v)<>'acceso_porton' then raise exception 'Wrong gate response'; end if;
 j:=public.digital_access_exchange(t,false,null);
 if j#>>'{command,target}'<>'porton' then raise exception 'Wrong gate target'; end if;
 if has_function_privilege('anon','public.digital_access_delivery_request(uuid,text)','EXECUTE') then raise exception 'Anon execute granted'; end if;
end $$;
select 'PASS: own-house authorization, expiration, offline, resident switch, arrears, atomic response, duplicate protection, both relays, acknowledgement and grants' as result;
rollback;