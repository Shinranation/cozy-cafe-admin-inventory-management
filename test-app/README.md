# Cozy Coffee Admin (`test-app`)

## Quick Setup

1. Install dependencies:
   - `npm install`
2. Create `.env` in `test-app` (or repo root, based on current Vite envDir):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_TX_REFERENCE_ID=1
VITE_TX_CASHIER_ID=1
```

3. Run app:
   - `npm run dev`

## Auth + Admin Access Model

- Promotions page is public by default.
- Admin inventory is shown only when:
  - user is signed in, and
  - `public.user_roles.role = 'admin'` for that auth user.

## Database / RLS Setup

Run `test-app/supabase/admin_rls_setup.sql` in Supabase SQL Editor.

It will:
- create `public.user_roles`,
- add `public.is_admin(uuid)` helper function,
- enable RLS on `inventory`, `inventory_transactions`, `user_roles`,
- enforce admin-only write operations for inventory modules.

After running that SQL, assign at least one admin:

```sql
insert into public.user_roles (user_id, role)
values ('YOUR_AUTH_USER_UUID', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

For day-to-day admin changes, use:
- `test-app/supabase/admin_role_management.sql`

To prevent accidental lockout (removing the last admin), run once:
- `test-app/supabase/admin_last_admin_guard.sql`

Emergency rollback (if you intentionally need to disable that protection):
- `test-app/supabase/admin_last_admin_guard_rollback.sql`

## Google Auth Setup (Supabase)

1. Supabase Dashboard -> Authentication -> Providers -> Google -> Enable.
2. In Google Cloud Console, create OAuth client credentials.
3. Add this redirect URI in Google Cloud:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Put Google Client ID/Secret into Supabase Google provider settings.
5. In Supabase URL configuration, add local redirect:
   - `http://localhost:5173`