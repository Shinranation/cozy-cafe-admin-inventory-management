# Public demo setup

This creates a separate shared playground. All visitors can edit the fictional cafe data without logging in. No production records or accounts are copied. The production migration remains unchanged.

## 1. Create the database

Create a **new Supabase project** named `cozy-cafe-demo`. Keep your existing project.

In the new project's SQL Editor, paste and run all of `setup.sql` once. It includes the base schema, current RPCs, demo permissions, photo bucket, and sample data. It refuses to run when public tables already exist, and uses one transaction to avoid partial setup. Do not run the historical migrations afterward: they restore authenticated-only checks.

Run `verify.sql` in the same SQL Editor to test the `anon` role. It checks reads, edits, order receipt, and recipe deductions, then rolls back all test writes. Run it before deleting or renaming the sample Cafe Latte or Milk records.

Seed data includes three menu items, three ingredients, recipes, an expense, a received sale, and a pending order.

## 2. Connect the app

Copy the values from `.env.demo.example` into the repository root `.env`. Replace the URL and public key with those from the **new demo project**. The project's Connect dialog provides its URL and publishable key; a legacy anon key also works. Never use a secret/service-role key.

```env
VITE_PUBLIC_DEMO=true
VITE_DEMO_SUPABASE_URL=https://YOUR-DEMO-PROJECT.supabase.co
VITE_DEMO_SUPABASE_ANON_KEY=YOUR-DEMO-PUBLISHABLE-OR-ANON-KEY
VITE_TX_CASHIER_ID=1
VITE_TX_REFERENCE_ID=1
```

The demo client uses only these demo credentials. It does not fall back to the original project's URL/key, and it does not reuse a previous login session. Missing demo credentials leave the client unconfigured and display a setup message.

From `test-app`, restart `npm run dev` after changing environment variables.

## 3. Deploy

Set the same variables in your Vercel project's environment settings, then redeploy. Vite embeds configuration at build time, so changing variables requires a new build. Keep the Vercel root directory as `test-app`.

The app displays a public demo banner. All visitors share the same changes. Receipt deletion/reverting and sales reset retain their confirmation phrases; the demo confirmation email is `demo@example.com` for everyone. This is a confirmation phrase, not an account or password.

## Limits and recovery

This is deliberately public app administration, including sales cleanup and photo deletion. Visitors do not receive Supabase dashboard access or database-owner privileges. User roles and log writes remain outside direct public editing. Logs have no authenticated visitor identity. There is no automatic nightly reset.

To start over, create another empty demo project, run `setup.sql`, update the demo URL/key, and rebuild. Do not rerun setup on your real cafe database.

Setting `VITE_PUBLIC_DEMO=false` restores the original credential selection, but does not restore the login UI previously removed. Restore the login and admin guards before making a production admin app available again.
