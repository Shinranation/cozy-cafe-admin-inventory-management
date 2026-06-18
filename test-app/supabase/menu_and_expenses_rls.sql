-- Run in Supabase SQL Editor after creating menu / expenses tables.
-- Uses the existing public.is_admin(auth.uid()) helper from admin_rls_setup.sql.

alter table public.menu enable row level security;
alter table public.expenses enable row level security;
alter table public.menu_ingredients enable row level security;

-- Menu: admins can add/edit/delete/read menu items.
-- Public customers use the get_menu_public() RPC instead of table reads.
drop policy if exists "menu_select_authenticated" on public.menu;
drop policy if exists "menu_select_admin_only" on public.menu;
create policy "menu_select_admin_only"
on public.menu
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "menu_modify_admin_only" on public.menu;
create policy "menu_modify_admin_only"
on public.menu
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Expenses: admins can add/edit/delete/read expense rows.
drop policy if exists "expenses_select_authenticated" on public.expenses;
drop policy if exists "expenses_select_admin_only" on public.expenses;
create policy "expenses_select_admin_only"
on public.expenses
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "expenses_modify_admin_only" on public.expenses;
create policy "expenses_modify_admin_only"
on public.expenses
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Menu ingredients: admins manage/read recipe links.
drop policy if exists "menu_ingredients_select_authenticated" on public.menu_ingredients;
drop policy if exists "menu_ingredients_select_admin_only" on public.menu_ingredients;
create policy "menu_ingredients_select_admin_only"
on public.menu_ingredients
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "menu_ingredients_modify_admin_only" on public.menu_ingredients;
create policy "menu_ingredients_modify_admin_only"
on public.menu_ingredients
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
