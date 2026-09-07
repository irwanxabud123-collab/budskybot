# Deployment runbook: GitHub → Supabase → Railway/Render

## 1. GitHub
Upload the repository contents. Do **not** commit `.env`, `WALLET_PAPER.json`, private keys, seed phrases, Supabase secrets, or Jupiter API keys.

## 2. Supabase
Run `supabase/migrations/001_trading_bot.sql` in the SQL Editor. The durable source for replay data is `public.replay_events`.

## 3. Railway — 24/7 worker
Railway persistent services are appropriate for a continuously running daemon. Configure a service from the GitHub repository, then set:

- Build Command: `npm run build`
- Start Command: `node dist/src/index.js paper --paper` for non-broadcasting mainnet quote collection.
- `MODE=PAPER`
- `NETWORK=mainnet-beta`
- `RPC_URL=<HTTPS mainnet RPC>`
- `JUPITER_BASE_URL=https://api.jup.ag/swap/v2`
- `JUPITER_API_KEY=<server-side key>`
- `SUPABASE_URL=<project URL>`
- `SUPABASE_KEY=<server-side Supabase key>` (or `SUPABASE_SECRET_KEY`)
- `WALLET_PATH=WALLET_PAPER.json` only if a local controlled workflow needs a wallet path; do not put the private key itself in source control.

Railway supports custom Start Commands and service environment variables. Review/stage the variable changes before deploying. (Railway start command documentation: https://docs.railway.com/deployments/start-command)

For a long-running worker, do not use a cron job. Railway distinguishes persistent services from scheduled jobs. (Railway services documentation: https://docs.railway.com/services)

## 4. Render — 24/7 worker
Create a **Background Worker** from the same GitHub repository:

- Build Command: `npm run build`
- Start Command: `node dist/src/index.js paper --paper`
- Node: use the project's Node engine or explicitly pin Node 22/24 according to your compatibility test.
- Add the same runtime variables in Render's Environment section.
- Keep wallet/key material out of Git. If a secret file is genuinely required by a controlled deployment, use Render's secret-file facility rather than committing it.

Render Background Workers are designed for continuously running processes that do not receive incoming traffic. (Render Background Workers: https://render.com/docs/background-workers)
Render provides environment variables and secret-file support in the service Environment settings. (Render environment variables and secrets: https://render.com/docs/configure-environment-variables)

## 5. Data validation
Run:

```bash
npm run check-data
npm run export -- --days 7 --output budsky_7days.json
```

`check-data` fails closed when OPEN/CLOSE counts or position IDs do not match, or when a CLOSE has no `position.realized_net_pnl`.

## 6. Mainnet real-money execution
Do not convert the non-broadcasting `paper:mainnet` command into an unattended real-money broadcaster. The project keeps real execution behind the explicit LIVE gates and transaction lifecycle. A confirmed on-chain transaction is required before an OPEN/CLOSE event is recorded.

## 6. Netlify Functions

For the HTTP application, deploy the `public` site plus `netlify/functions`. Set the production environment variables in the Netlify dashboard; do not place secrets in `netlify.toml` or Git. See `NETLIFY_ENV_CHECKLIST.md`. The production replay source is Supabase `replay_events`; the function filesystem is not durable. `/api/health` must return HTTP 503 when required Supabase persistence is unavailable.
