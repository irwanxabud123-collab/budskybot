# Budsky V9 — Total Audit (2026-09-07)

## Verdict
**NOT PRODUCTION READY / NOT LIVE-SAFE.**

The archive was audited and materially repaired, but the required real dependency-backed verification could not be completed in this environment because DNS/network access to the npm registry is unavailable and the the archive has now been supplied with a `package-lock.json`. Therefore this report deliberately does not claim build/test PASS.

## Highest-priority repair: calibration deadlock
Implemented an explicit bootstrap path:

`OHLCV CSV -> runSimpleBacktest() -> ATR trade outcomes -> 70% chronological training -> isotonic seed artifact -> calibration-store -> live-context -> strategy -> risk gate`

Sources are labelled separately:
- `BACKTEST_SEED`
- `LIVE_REPLAY`

When >=100 valid closed live trades are available, `LIVE_REPLAY` is preferred over the seed. The seed is not silently treated as live evidence.

### Seed label correction
The old proxy label `next.close > current.close` was removed. Candidate outcomes now follow the same ATR stop-loss/take-profit convention as the canonical strategy. If stop and target are both touched inside the same OHLC bar, the simulator chooses stop-loss first.

### Seed-live safety
`ALLOW_BACKTEST_SEED_LIVE=false` by default. If explicitly enabled, seed-based LIVE is capped by `BACKTEST_SEED_MAX_POSITION_USD` (default USD 10) and that cap cannot exceed `MAX_POSITION_USD`.

## Backtest methodology repair
- No longer deploys 100% of cash into every position.
- Position sizing uses a risk budget (`riskPerTradePct`) plus `MAX_POSITION_USD` and `MAX_TOTAL_EXPOSURE_USD` caps.
- Sharpe/Sortino are per-trade ratios and are not annualized.
- Calmar is also not annualized.
- Output contains `periodStartMs`, `periodEndMs`, and `PER_TRADE_NOT_ANNUALIZED`.
- Seed model is trained chronologically on the first 70% and evaluated on later candidates.

## CI / verification repair
- CI now requests Node 22.
- CI uses `npm ci` rather than mutable `npm install`.
- Required gates: static pattern check, full `npm run lint`, `npm run build`, `npm test`, functional audit, replay-contract validation.
- `scripts/audit-v9.mjs` was replaced by `scripts/static-pattern-check.mjs`; it is explicitly described as a source regex/static check, not a functional audit.
- Added `scripts/functional-audit.mjs`, executed after build in CI.

## Actual verification executed in this environment
### Static pattern check
`npm run audit:static` — **executed successfully**; all listed static checks returned PASS.

### TypeScript parser check
TypeScript 5.8.3 parser was run over 50 `.ts/.mts` files: **0 parse errors**. This is syntax parsing only, not a typecheck.

### JavaScript syntax
`node --check` was run across repository `.js/.mjs` files: **no syntax failures observed**.

### Required dependency-backed gates
| Command | Result | Evidence |
|---|---|---|
| `npm ci` | PENDING EXTERNAL VERIFICATION | `package-lock.json` is now present; this sandbox still cannot perform network-backed dependency installation/runtime verification. |
| `npm run lint` | FAIL | `@types/node` and `vitest/globals` unavailable because dependencies were not installed. |
| `npm run build` | FAIL | Same missing dependency/type-definition condition. |
| `npm test` | FAIL | `vitest: not found`. |
| `npm run audit:static` | EXECUTED SUCCESSFULLY | All static checks returned PASS. |
| `npm run audit:functional` | NOT EXECUTED | Requires `dist/`, which cannot be produced without the real dependency install/build. |

A temporary stub environment was used only for targeted source review; it was removed and is **not** treated as a build/test pass.

## Supabase audit
`001_trading_bot.sql` enables RLS on `trades`, `bot_events`, `execution_leases`, and `replay_events`, and revokes table access from `anon`/`authenticated`. Lease RPCs are restricted to `service_role`.

The migration was **not actually applied to a live Supabase project in this environment** because no project credentials were supplied. Therefore migration application and live RLS behavior remain deployment verification items.

The health endpoint was strengthened: when `REQUIRE_SUPABASE=true`, `/api/health` now requires both configured Supabase credentials and a successful REST read against `replay_events`; failure returns HTTP 503.

## Netlify audit
Production replay is designed to use Supabase as the durable sink. The local function filesystem is not treated as production source of truth. A Netlify environment checklist was added.

Safe defaults remain:
- `MODE=DRY_RUN`
- `LIVE_ENABLED=false`
- `LIVE_BROWSER_EXECUTION_ENABLED=false`
- `ALLOW_BACKTEST_SEED_LIVE=false`
- `ALLOW_TOKEN_2022=false`
- mint/freeze authority hard-blocks enabled by default.

## Signing / LIVE gate
Server-side environment-keypair signing was removed from the supported LIVE path. The legacy `/api/live` route is disabled and the CLI `live` command is blocked until a non-exportable KMS/HSM signing service is integrated.

Browser wallet execution remains separately gated by explicit LIVE flags.

## Token hard-block policy
New entries can be hard-blocked by:
- blacklist (`BLACKLISTED_MINTS`)
- active mint authority (`REQUIRE_MINT_AUTHORITY_DISABLED=true`)
- active freeze authority (`REQUIRE_FREEZE_AUTHORITY_DISABLED=true`)
- Token-2022 (`ALLOW_TOKEN_2022=false`), which conservatively blocks transfer-hook/extension risk until explicitly reviewed.

The policy is for new entries; it does not prevent liquidation of an already-open position solely because its token later becomes disallowed.

## Additional defects found and repaired during total audit
1. Replay calibration could have consumed `POSITION_UPDATE` unrealized P&L as if it were realized. Calibration now accepts only `POSITION_CLOSE` events with realized P&L.
2. Generic token position-close P&L logic incorrectly assumed SOL balances. It was changed to reconcile USDC and position-token deltas; USD fees remain missing unless a real SOL/USD conversion is available.
3. Execution could mark a transaction confirmed when parsed transaction metadata was not available. It now returns `UNKNOWN` and requires reconciliation.
4. Execution now treats unconfirmed commitment states as `UNKNOWN` rather than success.
5. Gecko pool selection now prefers the highest reported USD reserve instead of blindly using the first pool.
6. `.gitignore` now excludes wallet/key material patterns.
7. The ZIP contains no `.git` directory, so historical secret-commit verification is impossible from this archive alone.

## Repairs completed in this pass

### Transaction failure-injection and UNKNOWN recovery
- Added `tests/execution-failure.test.ts` covering: pre-broadcast RPC timeout, Jupiter `/execute` exception after signing, signature-not-visible, and confirmation-stuck states.
- Added an explicit `TIMEOUT` transition for a pre-broadcast simulation RPC timeout and `SIGNING_FAILED` handling for signer failures.
- Fixed an important ambiguity bug: when `/execute` throws after signing, the engine now derives the signature from the **signed** transaction and stores it as Solana base58, rather than trying to read a signature from the unsigned transaction.
- Added `src/execution/reconciliation-worker.ts` plus `npm run reconcile:unknown`. The worker only moves `UNKNOWN` to `CONFIRMED` or `CONFIRMATION_FAILED` when RPC/parsed-transaction evidence proves the outcome; absent/pending evidence remains `UNKNOWN`.
- Added a protected `/api/reconcile-unknown` trigger using `RECONCILIATION_CRON_SECRET`.
- The failure-injection tests are source-complete but have **not** been executed with Vitest in this environment because dependency installation remains network-blocked.

### Non-exportable signer draft
- Added `AwsKmsSigner` using AWS KMS Ed25519 signing. Private key material is never loaded into the process.
- Added environment-variable documentation for KMS configuration.
- This is explicitly a **draft** and has not been tested with a real AWS account/KMS key.

### Transaction program allowlist draft
- Added `ALLOWED_PROGRAM_IDS_DRAFT.md` with an initial Jupiter/Solana top-level program review list and explicit distinction between the Jupiter Swap V2 API and the on-chain Jupiter Aggregator program.
- The draft is **not** automatically inserted into LIVE configuration. Human review of a real production-built transaction remains mandatory.

### Paper trading and calibration isolation
- Connected `PaperBroker` to the `paper --paper` command through `PaperTradingSession`: BUY opens a virtual position, SELL closes it using the current Jupiter quote, with no signing or broadcast.
- Added explicit `execution_mode=PAPER_SIMULATED` replay events for virtual position open/close and `calibrationSource=PAPER_REPLAY`.
- Added strict calibration filtering so `LIVE_REPLAY` accepts only `execution_mode=ON_CHAIN`; mixed datasets cannot promote paper P&L into live calibration.
- Added a separate `ALLOW_PAPER_REPLAY_LIVE` gate and `PAPER_REPLAY_MAX_POSITION_USD` cap. Default is disabled.
- Added unit coverage for paper open/close, broker-derived P&L, and paper/live replay isolation. Tests are source-complete but have not been executed with Vitest here because dependency installation remains network-blocked.
- Cleaned tool-search citation artifacts from the markdown documentation generated in this work.

## Remaining blockers before real-money LIVE
1. In a networked Node 22 environment, run `npm ci` against the supplied `package-lock.json`, then run the full verification suite.
2. Run real `npm run lint`, `npm run build`, `npm test`, `npm run audit:functional`, and capture their output.
3. Apply Supabase migration to the intended project and verify RLS/service-role behavior with an independent test account. See `SUPABASE_MIGRATION_RLS_CHECKLIST.md`.
4. Populate a real backtest seed from an appropriate historical OHLCV dataset and review its OOS metrics; this does not prove live edge.
5. Collect >=100 completed live trades with fully realized P&L, preferably >=30 days, and replace seed calibration with `LIVE_REPLAY`.
6. Manually verify the AWS KMS/non-exportable signer against a real account/key, including actual Solana transaction signing, IAM controls and failure handling, before enabling significant-capital LIVE.
7. Independently review and finalize `ALLOWED_PROGRAM_IDS` against the exact Jupiter/Solana instruction set used in production. **Do not trust the draft list directly.**
8. Execute the new failure-injection suite and reconciliation integration tests in the networked dependency-backed environment; verify the scheduler/trigger actually drains UNKNOWN trades on a real Supabase/RPC deployment.
9. Perform controlled-capital mainnet testing according to `CONTROLLED_CAPITAL_MAINNET_TEST_PLAN.md`; this requires real capital and remains unexecuted.
10. Obtain an independent third-party security review before increasing capital.

## Honest conclusion

The V9 architecture is materially stronger and the bootstrap deadlock is addressed in code. This pass closes the **code-design portion** of failure recovery, adds a non-exportable KMS signing draft, and documents an initial program-ID allowlist review. The archive is still **not production-ready or live-safe** because dependency-backed CI, real Supabase deployment verification, real KMS verification, human allowlist review, real replay evidence, controlled-capital testing and independent security review remain outstanding.

## Mobile Control Center pass — 2026-09-07

Added a durable operator control plane for mobile PAPER/LIVE switching:
- `src/control/live-control.ts` stores the operational mode and emergency-stop state in Supabase.
- `netlify/functions/control.mts` exposes authenticated GET/POST control operations.
- `public/app.js` adds a mobile-friendly Control Center with PAPER/LIVE switch, Return to PAPER, and Emergency Stop.
- LIVE preparation/execution/close paths now require the durable control state to be LIVE + enabled + not emergency-stopped.
- `health` reports the durable operational state separately from the one-time deployment gate.
- `supabase/migrations/001_trading_bot.sql` adds the durable singleton control row with RLS and no anon/authenticated table privileges.

This does NOT make the bot production-ready. The one-time deployment gate still requires `MODE=LIVE` and `LIVE_ENABLED=true` after the full human approval checklist. The Control Center cannot bypass signer, risk, transaction-intent, reconciliation, dependency, database, or other safety gates. The migration must be applied and the control plane must be integration-tested in a real Supabase/Netlify environment before LIVE use.

### Round 5 repair findings closed

Round 5 source audit identified and repaired four execution/accounting defects: (1) LONG stop-loss/take-profit geometry was reversed and is now `stopLoss < entry < takeProfit`; (2) realized P&L is now recorded only on the closing `EXIT` trade so the risk engine cannot count one closed position twice; (3) realized net P&L is now calculated as actual wallet-delta gross P&L minus observed fees, because actual execution deltas already incorporate execution slippage, while entry/exit slippage remains recorded as diagnostic provenance; and (4) both live execution paths now distinguish unavailable transaction metadata (`UNKNOWN`) from an observed on-chain transaction failure (`CONFIRMATION_FAILED`). These are source-level repairs; build, tests, and live integration remain pending external execution verification.

### npm audit — keputusan sadar untuk rantai @solana/web3.js 1.x

Temuan 4 moderate pada rantai dependency `@solana/web3.js@1.98.4` → `jayson` → `stream-json`/`uuid` dinyatakan sebagai risiko yang diketahui dan **belum di-remediasi pada Round 4**. Versi 1.x terbaru yang dipakai saat ini masih terkena temuan tersebut, sedangkan jalur versi yang lebih baru/aman merupakan breaking change terhadap API 1.x. Keputusan ini harus diambil secara sadar oleh user: **(a)** menerima risiko DoS pada parsing JSON-RPC yang terkait dependency tersebut untuk sementara, dengan mempertahankan `@solana/web3.js@1.98.4`, atau **(b)** melakukan upgrade breaking ke jalur versi baru dan menyesuaikan source code serta seluruh pengujian. **Jangan menjalankan `npm audit fix --force`** untuk memaksa downgrade/upgrade otomatis karena dapat mengubah dependency utama secara breaking tanpa validasi kompatibilitas.
