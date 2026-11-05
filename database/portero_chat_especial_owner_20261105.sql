-- Chat especial para repartidores de empresas NO autorizadas.
-- No incluye ninguna operación de apertura y no otorga permisos al ESP32.
-- El token secreto de visitante se almacena solo como SHA-256; la identidad
-- del destinatario Owner la selecciona el servidor (nunca el visitante).
CREATE TABLE public.portero_owner_chats (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.profiles(id),
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 casa_numero text NOT NULL CHECK (casa_numero ~ '^(4[0-9]|5[0-9]|6[0-6])$'),
 empresa text NOT NULL CHECK (char_length(btrim(empresa)) BETWEEN 1 AND 80),
 repartidor text NOT NULL CHECK (char_length(btrim(repartidor)) BETWEEN 1 AND 80),
 tipo text NOT NULL CHECK (tipo IN ('comida','paqueteria','farmacia','visita','otro')),
 motivo text NOT NULL CHECK (char_length(btrim(motivo)) BETWEEN 1 AND 240),
 rate_key text NOT NULL,
 estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
 last_visitor_at timestamptz NOT NULL DEFAULT now(),
 last_owner_read_at timestamptz
);
CREATE INDEX portero_owner_chat_owner_actividad_idx
 ON public.portero_owner_chats(owner_id,updated_at DESC);
CREATE INDEX portero_owner_chat_rate_idx
 ON public.portero_owner_chats(rate_key,created_at DESC);

CREATE TABLE public.portero_owner_chat_mensajes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 chat_id uuid NOT NULL REFERENCES public.portero_owner_chats(id) ON DELETE CASCADE,
 autor text NOT NULL CHECK (autor IN ('repartidor','owner')),
 mensaje text NOT NULL CHECK (char_length(btrim(mensaje)) BETWEEN 1 AND 600),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portero_owner_chat_mensajes_idx
 ON public.portero_owner_chat_mensajes(chat_id,created_at,id);

ALTER TABLE public.portero_owner_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portero_owner_chat_mensajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY portero_owner_own_chats
 ON public.portero_owner_chats FOR SELECT TO authenticated
 USING (owner_id=auth.uid() AND public.current_user_role()='owner');
CREATE POLICY portero_owner_own_messages
 ON public.portero_owner_chat_mensajes FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.portero_owner_chats c
  WHERE c.id=chat_id AND c.owner_id=auth.uid() AND public.current_user_role()='owner'));

-- Todas las escrituras pasan por Edge Function, con validación de identidad
-- o token; no se conceden permisos de actualización al visitante ni a Admin.
REVOKE ALL ON public.portero_owner_chats FROM anon, authenticated;
REVOKE ALL ON public.portero_owner_chat_mensajes FROM anon, authenticated;
