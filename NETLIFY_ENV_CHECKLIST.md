# Netlify Environment Checklist — Budsky V9

## Wajib sebelum deploy
Set these in **Netlify Site configuration → Environment variables**, never in `netlify.toml`, Git, frontend JS, or committed files.

| Variable | Required | Safe default | Notes |
|---|---|---|---|
| `MODE` | No | `DRY_RUN` | LIVE must be explicit. |
| `NETWORK` | No | `mainnet-beta` | Verify intended network. |
| `RPC_URL` | **YES** | none | Must be valid URL; mainnet must be HTTPS. Prefer dedicated RPC. |
| `JUPITER_BASE_URL` | No | official Jupiter V2 URL | Keep server-side. |
| `JUPITER_API_KEY` | **YES for LIVE / market collection** | empty | Server secret; no frontend exposure. |
| `SUPABASE_URL` | **YES** | none | Required because `REQUIRE_SUPABASE=true`. |
| `SUPABASE_SECRET_KEY` | **YES** | empty | Preferred backend secret. Legacy service-role fallback exists. |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy fallback | empty | Use only if required by existing Supabase setup. Never publish. |
| `SUPABASE_KEY` | Legacy server key | empty | Do not substitute a public client key for the backend secret. |
| `INPUT_MINT` | **YES** | example only | Verify mint/decimals independently. |
| `OUTPUT_MINT` | **YES** | example only | Must pass token hard-block policy before new entry. |
| `INPUT_DECIMALS` / `OUTPUT_DECIMALS` | **YES** | example only | Must match on-chain mint. |
| `TRADE_AMOUNT` | **YES** | none | Base units. |
| Risk-limit variables | **YES** | example only | Review against capital and policy. |
| `LIVE_ENABLED` | No | `false` | Never enable accidentally. |
| `EMERGENCY_STOP` | No | `false` | Set true to halt LIVE. |
| `WALLET_PUBLIC_KEY` | **YES for LIVE** | empty | Must match the connected wallet. |
| `WALLET_SIGNING_MODE` | No | `BROWSER` | Server signing is not approved for significant capital. |
| `LIVE_BROWSER_EXECUTION_ENABLED` | No | `false` | Explicit final gate. |
| `API_AUTH_TOKEN` | **YES for LIVE** | empty | Required for authenticated wallet sessions. |
| `REQUIRE_SUPABASE` | No | `true` | Keep true in production. |
| `ALLOWED_PROGRAM_IDS` | **YES for LIVE** | empty | Explicit allowlist; do not deploy LIVE with an empty list. |
| `REQUIRE_TRANSACTION_INTENT_ALLOWLIST` | No | `true` | Keep true. |
| `MAX_TRANSACTION_INSTRUCTIONS` / `MAX_TRANSACTION_BYTES` | No | safe defaults | Review with Jupiter transaction format. |
| `BACKTEST_SEED_PATH` | No | `datasets/budsky-backtest-seed.json` | Seed artifact path; not production source of durable replay data. |
| `ALLOW_BACKTEST_SEED_LIVE` | No | `false` | Only enable after explicit seed review; LIVE seed is capped. |
| `BACKTEST_SEED_MAX_POSITION_USD` | No | `10` | Must not exceed `MAX_POSITION_USD`. |
| `BLACKLISTED_MINTS` | No | empty | Comma-separated hard-block list. |
| `REQUIRE_MINT_AUTHORITY_DISABLED` | No | `true` | New entries hard-block if false. |
| `REQUIRE_FREEZE_AUTHORITY_DISABLED` | No | `true` | New entries hard-block if false. |
| `ALLOW_TOKEN_2022` | No | `false` | Token-2022 is hard-blocked by default pending extension review. |
| `REPLAY_DATASET_PATH` | No | empty in production | Do not use function filesystem as production source of truth. |

## Production default invariant
If `MODE`, `LIVE_ENABLED`, or `LIVE_BROWSER_EXECUTION_ENABLED` is missing, the application must remain non-LIVE. A missing seed, missing calibration, stale market data, missing Supabase, missing program allowlist, or failed transaction inspection must reject/return UNKNOWN rather than inventing a value.

## Replay persistence
Netlify functions are ephemeral. `ReplayLogger` uses `SupabaseEventStore` as the durable sink when Supabase is configured. `REPLAY_DATASET_PATH` is suitable for local development only and must not be treated as the production research database.

## Deployment proof required
Before enabling LIVE, record actual output from:

```bash
npm ci
npm run lint
npm run build
npm test
npm run audit:static
npm run audit:functional
npm run check-replay
```

Then perform a deployed `/api/health` check and verify both `rpc.ok=true` and `persistence.ok=true`. A 503 from health is a deliberate fail-closed state, not a deployment success.
