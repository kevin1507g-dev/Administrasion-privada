-- Interfón WebRTC piloto: solo audio. No abre puertas ni envía comandos al ESP32.
-- Todas las operaciones se realizan mediante Edge Function con comprobación de participante.
create table if not exists public.interfon_webrtc_calls (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null unique references public.entregas_contacto(id) on delete cascade,
  casa_id uuid not null references public.casas(id),
  estado text not null default 'sonando'
    check (estado in ('sonando','conectando','rechazada','finalizada','vencida')),
  atendida_por uuid references public.profiles(id),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  vence_at timestamptz not null
);
create unique index if not exists interfon_webrtc_casa_activa_idx
 on public.interfon_webrtc_calls(casa_id)
 where estado in ('sonando','conectando');
create index if not exists interfon_webrtc_calls_estado_idx
 on public.interfon_webrtc_calls(casa_id,estado,vence_at);

create table if not exists public.interfon_webrtc_signals (
  id bigint generated always as identity primary key,
  llamada_id uuid not null references public.interfon_webrtc_calls(id) on delete cascade,
  emisor text not null check (emisor in ('visitante','residente')),
  tipo text not null check (tipo in ('offer','answer','ice')),
  contenido jsonb not null,
  creado_at timestamptz not null default now()
);
create index if not exists interfon_webrtc_signals_cursor_idx
 on public.interfon_webrtc_signals(llamada_id,id);

alter table public.interfon_webrtc_calls enable row level security;
alter table public.interfon_webrtc_signals enable row level security;
revoke all on public.interfon_webrtc_calls from public, anon, authenticated;
revoke all on public.interfon_webrtc_signals from public, anon, authenticated;
revoke all on sequence public.interfon_webrtc_signals_id_seq from public, anon, authenticated;
grant select,insert,update,delete on public.interfon_webrtc_calls to service_role;
grant select,insert,update,delete on public.interfon_webrtc_signals to service_role;
grant usage,select on sequence public.interfon_webrtc_signals_id_seq to service_role;
-- Las señales incluyen metadatos ICE/SDP: deben borrarse al finalizar la llamada.
-- El backend también limpia sesiones vencidas al recibir solicitudes.
-- Eliminar SDP y candidatos ICE (que pueden contener IP) de forma periódica.
-- No guarda grabaciones ni audio. pg_cron ya está instalado en este proyecto.
select cron.schedule(
 'interfon_webrtc_purgar_senales',
 '*/15 * * * *',
 $job$delete from public.interfon_webrtc_signals
      where creado_at < now() - interval '10 minutes'$job$
);
