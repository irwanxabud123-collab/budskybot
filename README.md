# Production-Grade Solana + Jupiter Trading Bot

Safety-first TypeScript application designed for **GitHub → Supabase → Netlify** deployment.

## Architecture
`Netlify Function → Config/Auth → Solana token validation → Strategy → Risk Engine → Jupiter Order → Quote validation → Transaction intent inspection → Signer → Jupiter Execute → Supabase persistence/reconciliation`

Budsky Bot is designed as the real application first. The browser-wallet LIVE path uses Phantom/Solflare signing; BACKTEST is an optional feature mode and never replaces the live application. LIVE still requires explicit server-side safety configuration and is never enabled by an unsafe implicit default. `/api/live` requires an idempotency key, Supabase persistence, transaction inspection, simulation, and Jupiter execution.

## Deployment
1. Extract this ZIP and upload the repository contents to GitHub.
2. Create a Supabase project and run `supabase/migrations/001_trading_bot.sql` in the SQL editor.
3. Connect the GitHub repository to Netlify.
4. Set environment variables in Netlify Project configuration. Do not commit secrets. Netlify Functions can read runtime environment variables; changes require a new deploy.
5. Verify `GET /api/health`.
6. Use `POST /api/dry-run` with `Authorization: Bearer <API_AUTH_TOKEN>` when configured and an `x-idempotency-key` header.
7. For Budsky browser-wallet LIVE, set `MODE=LIVE`, `LIVE_ENABLED=true`, `EMERGENCY_STOP=false`, `WALLET_SIGNING_MODE=BROWSER`, Supabase persistence, RPC, Jupiter API key, and an explicit `ALLOWED_PROGRAM_IDS` list. The browser path is `POST /api/prepare-trade` → wallet `signTransaction` → `POST /api/execute-trade`. The legacy server-signer `/api/live` path is disabled until non-exportable KMS/HSM signing is integrated.

## Required server variables
`SUPABASE_URL`, `SUPABASE_SECRET_KEY` (preferred current Supabase backend key), `RPC_URL`, Jupiter settings, token settings, and risk limits. `SUPABASE_SERVICE_ROLE_KEY` is supported only as a legacy fallback.

## Local
```bash
npm ci
npm run build
npm test
```

## Backtest
```bash
npm run backtest -- ./data/candles.csv
```

CSV columns: `timestamp,open,high,low,close,volume`.

## Important
This repository is deployable infrastructure for DRY_RUN/PAPER use. It is **not** a profitability guarantee and must not be treated as real-capital production-ready until every LIVE gate in `ACCEPTANCE.md` is independently verified.

## Official references
- Jupiter Swap API V2: https://dev.jup.ag/docs/swap/v2
- Supabase JavaScript: https://supabase.com/docs/reference/javascript/installing
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Netlify Functions: https://docs.netlify.com/build/functions/get-started/
- Netlify environment variables: https://docs.netlify.com/build/functions/environment-variables/

## Real-time application UI

This revision adds a responsive browser dashboard under `public/` and two Netlify Functions:

- `/api/markets` — real-time market intelligence using Jupiter Tokens API V2 category feeds (`toptrending`, `toptraded`, `toporganicscore`) with a short server cache and a 20-second browser refresh.
- `/api/portfolio?wallet=<address>` — reads the connected wallet's SOL balance and SPL token accounts from the configured Solana RPC.

The scanner ranks a broad live candidate universe and exposes transparent Technical / Market / Risk components plus reasons. It does not invent market data or claim that a score predicts profit.

Wallet connection is browser-side and currently detects Phantom and Solflare. Private keys/seed phrases are never requested by the UI.

### Important current boundary

The dashboard is the live market-intelligence and wallet-connection layer. Browser-wallet execution uses a fresh Jupiter order, server-side Risk Engine approval, transaction-intent inspection, explicit wallet signing, idempotency and persisted trade state before Jupiter Execute. The UI never receives or stores a private key or seed phrase. BACKTEST is an optional feature mode only.

Real-time means continuously refreshed live API data, not a guarantee that every token on Solana is evaluated on every block. The candidate universe is assembled from Jupiter's current ranked market feeds; stale/unreliable prices are not fabricated.

## Budsky → Jupiter execution model

Budsky is the application UI and intelligence/risk layer. **Open Position** is performed inside Budsky, but execution is powered by the official Jupiter Swap API V2. The live flow is:

`Budsky opportunity → fresh Jupiter order → Budsky Risk Engine → transaction inspection + simulation → connected Phantom/Solflare signs → Jupiter /execute → Solana confirmation`

The user does **not** need to open the Jupiter consumer app for this flow. The wallet is the signing authority; Budsky never receives a seed phrase or private key. Jupiter remains the execution venue/aggregator. The app can optionally add a separate “Open in Jupiter” handoff later, but that is not required for the in-app execution path.

Real-money browser execution is protected by `LIVE_BROWSER_EXECUTION_ENABLED=false` by default and must only be enabled after the remaining release gates in `ACCEPTANCE.md` are verified.


### Wallet authentication and recovery
Live browser execution uses a one-time wallet-signed challenge. The backend issues a short-lived HttpOnly session cookie; the API secret is never exposed to the browser. Prepared transactions are bound to their persisted transaction message and idempotency key. Unknown submissions are not retried; use the reconciliation endpoint after the signature becomes observable.


## Latest V4 hardening pass
- Wallet must be a required transaction signer, not merely present in static account keys.
- If Jupiter `/execute` throws after signing, the trade is persisted as `UNKNOWN` and the signed transaction signature is retained when derivable; no automatic retry occurs.
- Added baseline browser security headers (CSP, frame denial, MIME sniffing and permissions policy).
- UI now displays the actual configured operating mode instead of hard-coded `LIVE`.
- LIVE remains blocked until dependency installation, full typecheck/test, real Jupiter/Solana integration, and the remaining security gates are independently verified.

## Performance validation
See `PERFORMANCE_AUDIT.md`. The repository does not claim a proven trading edge without historical signal/execution data. The V9 backtest calls the canonical strategy, but it remains evidence-gated: without observed historical FA/execution data it reports NEED LIVE DATA rather than fabricating a production edge.

## Budsky Replay Dataset & Validation V6

Budsky now records an execution replay event from `ExecutionEngine` when `REPLAY_DATASET_PATH` is configured. The recorder never substitutes synthetic values for missing live measurements: unavailable bid/ask, fee USD, P&L, depth 1%, volatility, or latency remain `null`.

Canonical dataset: `datasets/budsky-replay.json` (empty baseline with `NEED LIVE DATA`). Schema: `dataset_schema.json`.

Replay/validation engine: `src/replay/replayEngine.ts`.

Run locally after dependencies are installed:

```bash
npm run validate-replay -- datasets/budsky-replay.json
```

The validation pipeline performs chronological 60/20/20 splitting, 30-day rolling walk-forward windows, daily market-regime segmentation, 1,000-order Monte Carlo, and the requested fee/slippage/latency/failed-transaction stress scenarios. It refuses to claim readiness when required execution observations are missing.

For local paper collection, set `REPLAY_DATASET_PATH=runtime/budsky-replay.jsonl`. On serverless Netlify, a local file is ephemeral; durable collection must be wired to an approved persistent log/data sink before relying on it as a research dataset.

## Data integrity / replay v2

Budsky now treats the replay dataset as an audit artifact, not a synthetic performance source. Runtime execution events are written to durable Supabase `replay_events` when configured, while local JSONL is optional. Missing bid/ask, depth, volatility, fee USD, latency, failure, and realized P&L remain missing rather than being guessed.

The V9 backtest now calls the canonical strategy used by live/paper. It is still not evidence of production edge unless the supplied dataset contains the required real historical market/execution evidence and the OOS/calibration gates pass.

For live/paper research, a completed position lifecycle is required: entry/quote/execution plus exit/realized P&L. Seven days is a data-capture phase and is not sufficient by itself for the 30-day walk-forward/100-trade validation gate.

## Paper 7 hari & lifecycle posisi

### Paper mode (tidak menyiarkan transaksi)
```bash
npm run build
npm run paper
```
`npm run paper` membutuhkan `MODE=PAPER`, Supabase persistence, dan menggunakan quote Jupiter nyata. Mode ini hanya merekam observasi/sinyal/quote; tidak mengklaim fill atau realized P&L on-chain.

### Data check
```bash
npm run check-data
```
Output:
`Total Events: X | Open: Y | Close: Y | MISSING: Z`

### Lifecycle live
1. Entry yang benar-benar confirmed menghasilkan `POSITION_OPEN`.
2. `/api/position-update` merekam `POSITION_UPDATE` dari quote Jupiter terbaru.
3. `/api/prepare-close-position` menyiapkan swap token posisi kembali ke USDC tanpa signing server.
4. `/api/execute-trade` mengeksekusi setelah wallet signing dan, setelah confirmed, menghasilkan `POSITION_CLOSE` dari data transaksi on-chain.

`POSITION_CLOSE` tidak dibuat jika data chain yang diperlukan untuk menghitung realized P&L tidak tersedia.

## Recovery / reconciliation

Ambiguous execution results are fail-closed as `UNKNOWN`. `src/execution/reconciliation-worker.ts` can reconcile persisted UNKNOWN trades from on-chain evidence without retrying Jupiter `/execute`. Trigger it with `npm run reconcile:unknown` after a successful build, or use the protected `/api/reconcile-unknown` endpoint from a scheduler configured with `RECONCILIATION_CRON_SECRET`.

## Signing draft

`src/execution/signer.ts` contains a draft AWS KMS Ed25519 non-exportable signer. **It has not been tested against a real AWS account/KMS key and must be manually verified before LIVE.** Server-side LIVE remains disabled until the signer, IAM policy, transaction signing, and operational recovery path are independently verified.

## Transaction program allowlist

See `ALLOWED_PROGRAM_IDS_DRAFT.md` for the initial program-ID review list.

> **Daftar ini adalah draf awal dan WAJIB direview manual oleh manusia sebelum dipakai di LIVE — jangan langsung dipercaya.**


## PAPER mode
`npm run paper` now performs virtual position lifecycle: a BUY opens a simulated position and a SELL closes it using fresh Jupiter quotes. No transaction is signed or broadcast. Events are tagged `execution_mode=PAPER_SIMULATED` and calibration source `PAPER_REPLAY`; they are intentionally weaker evidence than `LIVE_REPLAY`.

**PAPER_REPLAY must never be treated as LIVE_REPLAY. In LIVE mode it is blocked by default and requires a separate explicit gate.**

## Mobile Control Center

Budsky includes a durable server-side Control Center at `/api/control` and a mobile-friendly UI switch for PAPER/LIVE operation. Daily switching does not require editing Netlify environment variables. The one-time deployment gate remains separate: the approved deployment must be LIVE-capable (`MODE=LIVE`, `LIVE_ENABLED=true`), while the durable control state remains PAPER until an authenticated operator explicitly activates LIVE. If the control state is unavailable, LIVE execution fails closed. Emergency Stop switches the durable state back to PAPER and blocks new LIVE entries.
