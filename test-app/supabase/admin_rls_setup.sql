-- 1) Role table tied to Supabase Auth users
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff', 'customer')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_transactions enable row level security;

-- 2) Helper function used by policies
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = uid
      and ur.role = 'admin'
  );
$$;

-- 3) user_roles policies
drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_roles_service_manage" on public.user_roles;
create policy "user_roles_service_manage"
on public.user_roles
for all
to service_role
using (true)
with check (true);

-- 4) inventory policies
drop policy if exists "inventory_select_authenticated" on public.inventory;
create policy "inventory_select_authenticated"
on public.inventory
for select
to authenticated
using (true);

drop policy if exists "inventory_modify_admin_only" on public.inventory;
create policy "inventory_modify_admin_only"
on public.inventory
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- 5) inventory_transactions policies
drop policy if exists "inventory_tx_read_authenticated" on public.inventory_transactions;
create policy "inventory_tx_read_authenticated"
on public.inventory_transactions
for select
to authenticated
using (true);

drop policy if exists "inventory_tx_insert_admin_only" on public.inventory_transactions;
create policy "inventory_tx_insert_admin_only"
on public.inventory_transactions
for insert
to authenticated
with check (public.is_admin(auth.uid()));
