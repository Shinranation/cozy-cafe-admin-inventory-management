-- Admin role management helpers for Supabase SQL Editor.
-- Replace placeholders before running.

-- 1) View users and current app role
select
  au.id as user_id,
  au.email,
  ur.role
from auth.users au
left join public.user_roles ur on ur.user_id = au.id
order by au.created_at desc;

-- 2) Promote one user to admin
-- Replace USER_UUID_HERE with an auth.users.id value.
insert into public.user_roles (user_id, role)
values ('USER_UUID_HERE', 'admin')
on conflict (user_id) do update
set role = excluded.role;

-- 3) Promote multiple users to admin at once
-- Replace UUID values with real auth.users IDs.
insert into public.user_roles (user_id, role)
values
  ('UUID_ADMIN_1', 'admin'),
  ('UUID_ADMIN_2', 'admin')
on conflict (user_id) do update
set role = excluded.role;

-- 4) Demote admin to staff
-- Replace USER_UUID_HERE with a real user ID.
update public.user_roles
set role = 'staff'
where user_id = 'USER_UUID_HERE';

-- 5) Remove role record completely (optional)
-- User can still sign in, but has no app role until re-assigned.
delete from public.user_roles
where user_id = 'USER_UUID_HERE';
