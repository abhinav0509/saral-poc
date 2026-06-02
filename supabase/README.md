# Saral · Supabase

Database schema, migrations, RPCs, and pgTAP tests. This is the backend for the
multi-tenant, production direction (see the native-migration plan).

## Files

```
config.toml                      CLI project config (local stack, pooler, seed)
migrations/
  0001_init.sql                  baseline schema (clinics, visits, prescriptions, events) + POC RLS
  0002_clinic_blocks.sql         doctor unavailability blocks
  0003_multitenancy.sql          profiles, clinic_members, clinic_invites, auth helpers, on-signup trigger
  0004_visits_hardening.sql      public_token, prescriptions.clinic_id, concurrency constraints, indexes
  0005_onboarding_rpcs.sql       create_clinic_and_admin(), invite_staff()
  0006_patient_rpcs.sql          anon RPCs: get_clinic_public/get_visit_public/get_slot_availability/
                                 create_self_checkin/cancel_visit_public
seed.sql                         Dr. Mehta's Clinic + sample queue (local/dev only)
tests/0001_hardening.test.sql    pgTAP: constraints, triggers, patient RPCs
```

## What Phase 1 does (and doesn't)

- **Adds** real auth/tenancy tables, an opaque `public_token` for patient URLs,
  DB-level concurrency invariants (one `now_serving`/clinic, unique live slot,
  unique per-day token), denormalised `prescriptions.clinic_id`, and SECURITY
  DEFINER RPCs so unauthenticated patients never need direct table access.
- **Does NOT yet** flip the permissive POC RLS on `clinics`/`visits`/
  `prescriptions`/`events` to authenticated-only — that's Phase 2, once the apps
  are cut over to auth + the patient RPCs. New tables (profiles/members/invites)
  are already locked down to authenticated.
- **Deferred to Phase 4** (needs Edge Functions): making the `prescriptions`
  storage bucket private + signed URLs.

## Prerequisites

Install the Supabase CLI (Docker required for the local stack):

```bash
brew install supabase/tap/supabase     # macOS
# or: https://supabase.com/docs/guides/cli
```

## Local development

```bash
cd supabase
supabase start          # boots Postgres + Studio + Auth locally (needs Docker)
supabase db reset       # applies migrations 0001→0006 in order, then seed.sql
supabase test db        # runs pgTAP tests in tests/
```

`supabase db reset` rebuilds the DB from scratch every time — the canonical way
to verify the full migration chain.

## Applying to a hosted project (staging → prod)

Create a **separate `saral-staging` project** first; never test migrations on prod.

```bash
supabase link --project-ref <staging-ref>
supabase db push        # applies any not-yet-applied migrations
```

If a project was set up **before** the CLI (i.e. `0001_init.sql` + `0002` were
run by hand in the SQL editor), don't re-run those — apply `0003`–`0006` in order
via the SQL editor, or `supabase migration repair` to mark 0001/0002 as applied
before `db push`.

## Conventions

- Migrations are additive and ordered (`000N_name.sql`); never edit an applied one.
- All cross-tenant access goes through `auth_clinic_ids()` / `is_clinic_admin()`
  in RLS policies; all patient access goes through the anon RPCs in `0006`.
- Timezone for per-day token counters and slot days is **Asia/Kolkata**.
