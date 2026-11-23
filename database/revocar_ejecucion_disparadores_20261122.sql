-- Endurecimiento sin modificar lógica de negocio ni pulsos físicos.
-- Las siguientes funciones RETORNAN trigger; se ejecutan por disparadores instalados.
-- No forman parte de la API RPC de residentes, visitantes o equipo.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.audit_owner_finance_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_staff_actualizar_fecha() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_payment_transfer_reference() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_owner_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notificar_chat_staff_mensaje() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_house_dues() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.require_owner_finance_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_payment_quota_status() FROM PUBLIC, anon, authenticated;
COMMIT;
