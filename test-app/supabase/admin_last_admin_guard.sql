-- Prevent removing/demoting the last admin in public.user_roles.
-- Run once in Supabase SQL Editor.

create or replace function public.prevent_last_admin_loss()
returns trigger
language plpgsql
as $$
declare
  admin_count integer;
begin
  -- Trigger only when OLD row is admin and NEW row is non-admin or deleted.
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    select count(*) into admin_count
    from public.user_roles
    where role = 'admin';

    if admin_count <= 1 then
      raise exception 'Operation blocked: cannot remove/demote the last admin.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_last_admin_loss on public.user_roles;
create trigger trg_prevent_last_admin_loss
before update or delete on public.user_roles
for each row
execute function public.prevent_last_admin_loss();
