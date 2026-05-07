-- Emergency rollback for last-admin protection.
-- Use only for maintenance scenarios where you need to bypass the guard.

drop trigger if exists trg_prevent_last_admin_loss on public.user_roles;
drop function if exists public.prevent_last_admin_loss();
