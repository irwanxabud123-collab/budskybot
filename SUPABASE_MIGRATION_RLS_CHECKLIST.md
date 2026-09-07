# Budsky V9 — Supabase Migration & RLS Verification Checklist

**Purpose:** apply `supabase/migrations/001_trading_bot.sql` to the real Supabase project and independently verify that the database cannot be used by an ordinary client account to read/write trading state.

> **This is a deployment checklist, not proof that the migration has been applied.** The repository audit has not applied it to a real project.

## 0. Preconditions

- [ ] Identify the exact production Supabase project.
- [ ] Create a separate **test** Supabase project if possible. If not, use a dedicated test schema/database and a separate test user; do not test by experimenting with the production trading records.
- [ ] Have the project owner/admin access available.
- [ ] Keep the Supabase secret/service-role credential server-side only.
- [ ] Do not paste a secret key into Git, `.env.example`, browser code, screenshots, or chat logs.
- [ ] Record the migration filename/version being applied: `001_trading_bot.sql`.

## 1. Backup / baseline

- [ ] Export or otherwise snapshot the existing database before applying the migration.
- [ ] Record whether `trades`, `bot_events`, `execution_leases`, and `replay_events` already exist.
- [ ] Record any existing indexes/functions with the same names.
- [ ] Review the migration once before executing it, especially the `security definer` lease functions.

## 2. Apply the migration

1. Open the intended Supabase project.
2. Open **SQL Editor**.
3. Create a new query.
4. Paste the exact contents of:
   `supabase/migrations/001_trading_bot.sql`
5. Execute the entire migration.
6. Save the SQL Editor result/screenshot as deployment evidence.
7. If it fails, **stop**. Do not manually delete half-created objects until the failure is understood.

## 3. Verify tables and columns

Run:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('trades', 'bot_events', 'execution_leases', 'replay_events')
order by table_name;
```

Expected: all four tables are present.

Verify the critical `trades` columns:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'trades'
order by ordinal_position;
```

Confirm the migration-added fields exist, including:

- `wallet_public_key`
- `transaction`
- `signature`
- `state`
- `request_id`
- `position_id`
- `trade_side`
- `position_quantity_raw`
- `realized_pnl_usd`
- `fee_usd`
- `notional_usd`
- `execution_slippage_bps`

## 4. Verify RLS is enabled

Run:

```sql
select schemaname, tablename, rowsecurity, forcerowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('trades', 'bot_events', 'execution_leases', 'replay_events')
order by tablename;
```

Expected:

- `rowsecurity = true` for all four tables.
- `forcerowsecurity` does not need to be true for the service-role backend because the service role is intentionally privileged; the important requirement is that ordinary roles cannot access these tables.

## 5. Verify privileges for ordinary roles

Run:

```sql
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('trades', 'bot_events', 'execution_leases', 'replay_events')
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;
```

Expected: **no ordinary table privileges** are granted to `anon` or `authenticated` by this migration.

## 6. Verify lease RPC privileges

Run:

```sql
select routine_schema, routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('claim_execution_lease', 'release_execution_lease')
order by routine_name, grantee;
```

Expected:

- `service_role` has `EXECUTE`.
- `public`/ordinary roles do not retain `EXECUTE` from the migration's final grants.

## 7. Test with a separate authenticated account

Create a dedicated test user that is **not** the backend service identity.

Using that test user's Supabase session/API context, attempt:

```sql
-- Conceptual checks: execute these through the client role/API context,
-- not from the admin SQL editor.
select * from public.trades limit 1;
select * from public.bot_events limit 1;
select * from public.execution_leases limit 1;
select * from public.replay_events limit 1;
```

Expected: the client must **not** be able to read these tables.

Also test write attempts through the same ordinary client identity:

- [ ] INSERT into `trades` is denied.
- [ ] UPDATE `trades` is denied.
- [ ] INSERT into `bot_events` is denied.
- [ ] INSERT into `replay_events` is denied.
- [ ] Direct lease-table writes are denied.
- [ ] Calling `claim_execution_lease` directly as the ordinary client is denied.
- [ ] Calling `release_execution_lease` directly as the ordinary client is denied.

Record the actual HTTP/SQL error for each denied operation.

## 8. Test the backend service identity separately

Using the **server-side** Supabase secret/service-role credential only from a secure backend environment:

- [ ] Backend can read `trades`.
- [ ] Backend can insert/update `trades`.
- [ ] Backend can append `bot_events`.
- [ ] Backend can append `replay_events`.
- [ ] Backend can call `claim_execution_lease`.
- [ ] Backend can call `release_execution_lease`.

Do not expose this credential to the test user's browser or frontend bundle.

## 9. Verify the lease functions themselves

Test two calls with the same lock key:

1. First backend call should claim the lease.
2. Second immediate backend call with a different trade should not steal the unexpired lease.
3. Release the lease.
4. A subsequent claim should succeed.
5. Wait for expiry in a test environment and verify an expired lease can be reclaimed.

This specifically validates the `security definer` functions rather than assuming their grants are sufficient.

## 10. Verify application connectivity

After database tests pass:

- [ ] Set `SUPABASE_URL` and the server-only secret in the deployment environment.
- [ ] Keep `REQUIRE_SUPABASE=true`.
- [ ] Run the application's health check.
- [ ] Confirm the health endpoint sees the Supabase REST API as reachable.
- [ ] Confirm replay events are actually durable in `replay_events`.
- [ ] Confirm a test execution event can be written and read back.

## 11. Evidence package

Save:

- [ ] Migration execution result.
- [ ] Table/column verification output.
- [ ] RLS verification output.
- [ ] Ordinary-account denied-operation results.
- [ ] Service-role successful-operation results.
- [ ] Lease claim/release results.
- [ ] Application health result.
- [ ] Date, project identifier, migration version, reviewer name.

## 12. Stop conditions

**Do not enable LIVE** if any of these occur:

- RLS is disabled on a trading-state table.
- An ordinary authenticated account can read or mutate trading records.
- `anon` can access trading records.
- An ordinary account can call the lease RPCs.
- Backend persistence fails intermittently or silently falls back to local ephemeral storage.
- The migration was only partially applied and the resulting schema has not been reviewed.

## Control Center migration additions

After applying the migration, verify `public.bot_control_state` exists with exactly one `singleton` row, defaulting to `PAPER`, `live_enabled=false`, and `emergency_stop=false`. Verify RLS is enabled and `anon`/`authenticated` have no direct table privileges. Control mutations are performed server-side using the configured persistence key and require an authenticated wallet session through the Control Center API.
